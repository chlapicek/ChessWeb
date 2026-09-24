using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class ApiIntegrationTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ApiIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    // Registers a fresh, dedicated RegisteredUser so tests don't compete over the shared seeded user pool.
    // A unique default name avoids name-search collisions with other tests' throwaway users.
    private static async Task<UserDto> RegisterTestUserAsync(HttpClient client, string? fullName = null)
    {
        fullName ??= $"Test Player {Guid.NewGuid():N}";
        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"test-{Guid.NewGuid():N}@chessweb.local", "Player123!#", fullName, null, null, null));
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);
        var registerAuth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(registerAuth);
        return registerAuth!.User;
    }

    [Fact]
    public async Task AnonymousUser_CanGetArticles()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/articles");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var paged = await response.Content.ReadFromJsonAsync<PagedResult<ArticleDto>>();
        Assert.NotNull(paged);
        Assert.True(paged.TotalCount >= 0);
    }

    [Fact]
    public async Task AnonymousUser_CanSeeSeededCalendarData()
    {
        var client = _factory.CreateClient();

        var eventsResponse = await client.GetAsync("/api/calendar/events");
        var events = await eventsResponse.Content.ReadFromJsonAsync<List<ChessWeb.Domain.Entities.CalendarEvent>>();
        Assert.NotNull(events);

        var seededCategories = Enum.GetValues<ChessWeb.Domain.Entities.CalendarEventCategory>();
        Assert.All(seededCategories, category =>
            Assert.Contains(events!, calendarEvent => calendarEvent.Category == category));
    }

    [Fact]
    public async Task RegisteredUser_CanReadTeamAvailability_WhilePublicCompetitionRouteIsGone()
    {
        var client = _factory.CreateClient();
        var publicCompetitionResponse = await client.GetAsync("/api/competitions");
        Assert.Equal(HttpStatusCode.NotFound, publicCompetitionResponse.StatusCode);

        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);
        var users = await client.GetFromJsonAsync<List<UserDto>>("/api/auth/users");
        var anna = users!.First(user => user.Email == "anna.novakova@chessweb.local");
        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Availability Test {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(anna.Id));
        var createEntryResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/entries", new UpsertTeamAvailabilityEntryRequest(null, "Anna Novakova", "1985", 1, DateTime.UtcNow.AddDays(7), "SK Riverside", "Club", true, AvailabilityStatus.Pending, false, null));
        Assert.Equal(HttpStatusCode.Created, createEntryResponse.StatusCode);

        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("anna.novakova@chessweb.local", "Player123!#"));
        var authResponse = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(authResponse);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authResponse.Token);
        var teamsResponse = await client.GetAsync("/api/teamavailability/teams");
        Assert.Equal(HttpStatusCode.OK, teamsResponse.StatusCode);
        var teams = await teamsResponse.Content.ReadFromJsonAsync<List<TeamAvailabilityTeamDto>>();
        Assert.NotNull(teams);
        Assert.NotEmpty(teams!);

        var availabilityResponse = await client.GetAsync($"/api/teamavailability/team/{teams![0].Id}");
        Assert.Equal(HttpStatusCode.OK, availabilityResponse.StatusCode);
        var availability = await availabilityResponse.Content.ReadFromJsonAsync<TeamAvailabilityDto>();
        Assert.NotNull(availability);
        Assert.NotEmpty(availability!.Entries);
        Assert.NotEmpty(availability.Dates);
        Assert.NotEmpty(availability.Players);
        Assert.All(availability.Entries, entry => Assert.Equal(availability.TeamId, entry.TeamId));
    }

    [Fact]
    public async Task Admin_CanBuildAvailabilityMatrix_AndPlayerCanTickOwnCell()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var assignableUser = await RegisterTestUserAsync(client);
        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Availability Matrix {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);

        var registeredPlayerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(assignableUser.Id, null));
        Assert.Equal(HttpStatusCode.Created, registeredPlayerResponse.StatusCode);
        var registeredPlayer = await registeredPlayerResponse.Content.ReadFromJsonAsync<TeamAvailabilityPlayerDto>();
        Assert.NotNull(registeredPlayer);
        Assert.Equal(assignableUser.Id, registeredPlayer!.PlayerUserId);
        var teamsAfterAvailabilityAdd = await client.GetFromJsonAsync<List<TeamDto>>("/api/teams");
        Assert.Contains(teamsAfterAvailabilityAdd!.Single(updatedTeam => updatedTeam.Id == team.Id).UserIds, userId => userId == assignableUser.Id);

        var dateResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/dates", new AddTeamAvailabilityDateRequest(DateTime.UtcNow.AddDays(14), "SK Matrix", "Club", true));
        Assert.Equal(HttpStatusCode.Created, dateResponse.StatusCode);
        var date = await dateResponse.Content.ReadFromJsonAsync<TeamAvailabilityDateDto>();
        Assert.NotNull(date);

        var duplicateEntryResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/entries", new UpsertTeamAvailabilityEntryRequest(assignableUser.Id, assignableUser.FullName, null, date!.RoundNumber, date.MatchDate, "SK Matrix", "Club", true, AvailabilityStatus.Pending, false, null));
        Assert.Equal(HttpStatusCode.BadRequest, duplicateEntryResponse.StatusCode);

        var duplicateDateResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/dates", new AddTeamAvailabilityDateRequest(DateTime.UtcNow.AddDays(14), "SK Matrix", "Club", true));
        Assert.Equal(HttpStatusCode.BadRequest, duplicateDateResponse.StatusCode);

        var duplicateRegisteredPlayerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(assignableUser.Id, null));
        Assert.Equal(HttpStatusCode.BadRequest, duplicateRegisteredPlayerResponse.StatusCode);

        var memberNameAsCustomResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, assignableUser.FullName.ToUpperInvariant()));
        Assert.Equal(HttpStatusCode.BadRequest, memberNameAsCustomResponse.StatusCode);

        var playerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Guest Player"));
        Assert.Equal(HttpStatusCode.Created, playerResponse.StatusCode);
        var player = await playerResponse.Content.ReadFromJsonAsync<TeamAvailabilityPlayerDto>();
        Assert.NotNull(player);
        Assert.Equal("Guest Player", player!.PlayerName);

        var duplicatePlayerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Guest Player"));
        Assert.Equal(HttpStatusCode.BadRequest, duplicatePlayerResponse.StatusCode);

        var annaLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(assignableUser.Email, "Player123!#"));
        var annaAuth = await annaLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(annaAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", annaAuth.Token);

        var availabilityBeforeSelfUpdate = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        var ownEntry = availabilityBeforeSelfUpdate!.Entries.Single(entry => entry.PlayerUserId == assignableUser.Id && entry.MatchDate.Date == date.MatchDate.Date);
        var forbiddenGeneralUpdate = await client.PutAsJsonAsync($"/api/teamavailability/entries/{ownEntry.Id}", new UpsertTeamAvailabilityEntryRequest(null, "Changed Player", null, 99, date.MatchDate.AddDays(1), "Changed Opponent", "Changed Location", false, AvailabilityStatus.Tentative, true, "blocked"));
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenGeneralUpdate.StatusCode);
        var selfResponse = await client.PutAsJsonAsync($"/api/teamavailability/entries/{ownEntry.Id}/self", new UpdateOwnTeamAvailabilityRequest(AvailabilityStatus.Available, false, null));
        Assert.Equal(HttpStatusCode.NoContent, selfResponse.StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);
        var adminUpdateResponse = await client.PutAsJsonAsync($"/api/teamavailability/entries/{ownEntry.Id}", new UpsertTeamAvailabilityEntryRequest(null, "Changed Player", null, 99, date.MatchDate.AddDays(1), "Changed Opponent", "Changed Location", false, AvailabilityStatus.Tentative, true, "admin note"));
        Assert.Equal(HttpStatusCode.NoContent, adminUpdateResponse.StatusCode);

        var removeMemberResponse = await client.DeleteAsync($"/api/teams/{team.Id}/members/{assignableUser.Id}");
        Assert.Equal(HttpStatusCode.NoContent, removeMemberResponse.StatusCode);
        var secondDate = DateTime.UtcNow.AddDays(21).Date;
        var secondDateResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/dates", new AddTeamAvailabilityDateRequest(secondDate, "SK Followup", "Club", true));
        Assert.Equal(HttpStatusCode.Created, secondDateResponse.StatusCode);
        var secondDateDto = await secondDateResponse.Content.ReadFromJsonAsync<TeamAvailabilityDateDto>();
        Assert.NotNull(secondDateDto);

        var availability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        Assert.NotNull(availability);
        Assert.Equal(3, availability!.Entries.Count);
        Assert.Equal(2, availability.Dates.Count);
        Assert.Equal(2, availability.Players.Count);
        Assert.Contains(availability.Entries, entry => entry.PlayerUserId == assignableUser.Id && entry.PlayerName == assignableUser.FullName && entry.MatchDate.Date == date.MatchDate.Date && entry.OpponentTeam == "SK Matrix" && entry.Location == "Club" && entry.Status == AvailabilityStatus.Tentative && entry.IsDriver && entry.Notes == "admin note");
        Assert.Contains(availability.Entries, entry => entry.PlayerUserId == null && entry.PlayerName == "Guest Player");
        Assert.DoesNotContain(availability.Entries, entry => entry.PlayerUserId == assignableUser.Id && entry.MatchDate.Date == secondDate);
    }

    [Fact]
    public async Task Admin_CanAddAvailabilityDateBeforePlayers()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var assignableUser = await RegisterTestUserAsync(client);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Availability Date First {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);

        var matchDate = DateTime.UtcNow.AddDays(28).Date;
        var dateResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/dates", new AddTeamAvailabilityDateRequest(matchDate, "SK First", "Club", true));
        Assert.Equal(HttpStatusCode.Created, dateResponse.StatusCode);
        var date = await dateResponse.Content.ReadFromJsonAsync<TeamAvailabilityDateDto>();
        Assert.NotNull(date);

        var emptyAvailability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        Assert.NotNull(emptyAvailability);
        Assert.Single(emptyAvailability!.Dates);
        Assert.Empty(emptyAvailability.Players);
        Assert.Empty(emptyAvailability.Entries);

        var registeredPlayerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(assignableUser.Id, null));
        Assert.Equal(HttpStatusCode.Created, registeredPlayerResponse.StatusCode);

        var availabilityAfterRegisteredPlayer = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        Assert.NotNull(availabilityAfterRegisteredPlayer);
        Assert.Single(availabilityAfterRegisteredPlayer!.Dates);
        Assert.Single(availabilityAfterRegisteredPlayer.Players);
        Assert.Single(availabilityAfterRegisteredPlayer.Entries);
        Assert.Equal(assignableUser.Id, availabilityAfterRegisteredPlayer.Entries[0].PlayerUserId);
        var teamsAfterRegisteredPlayer = await client.GetFromJsonAsync<List<TeamDto>>("/api/teams");
        Assert.Contains(teamsAfterRegisteredPlayer!.Single(updatedTeam => updatedTeam.Id == team.Id).UserIds, userId => userId == assignableUser.Id);

        var playerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Date First Guest"));
        Assert.Equal(HttpStatusCode.Created, playerResponse.StatusCode);

        var availability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        Assert.NotNull(availability);
        Assert.Single(availability!.Dates);
        Assert.Equal(2, availability.Players.Count);
        Assert.Equal(2, availability.Entries.Count);
        Assert.Contains(availability.Entries, entry => entry.PlayerName == "Date First Guest" && entry.MatchDate.Date == matchDate);
        Assert.Contains(availability.Entries, entry => entry.PlayerUserId == assignableUser.Id && entry.MatchDate.Date == matchDate);
    }

    [Fact]
    public async Task LegacyAvailabilityEntries_AreNormalizedForLaterPlayersAndDates()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var assignableUser = await RegisterTestUserAsync(client);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Availability Legacy {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        var addMemberResponse = await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(assignableUser.Id));
        Assert.Equal(HttpStatusCode.OK, addMemberResponse.StatusCode);

        var legacyDate = DateTime.Today.AddDays(10);
        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            context.TeamAvailabilityEntries.Add(new TeamAvailabilityEntry { TeamId = team.Id, PlayerUserId = assignableUser.Id, PlayerName = assignableUser.FullName, PlayerRating = assignableUser.ChessRating, RoundNumber = 1, MatchDate = legacyDate, OpponentTeam = "SK Legacy", Location = "Club", IsHomeMatch = true, Status = AvailabilityStatus.Pending });
            await context.SaveChangesAsync();
        }

        var normalizedAvailability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        Assert.NotNull(normalizedAvailability);
        Assert.Single(normalizedAvailability!.Dates);
        Assert.Single(normalizedAvailability.Players);
        Assert.Single(normalizedAvailability.Entries);

        var addGuestResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Legacy Guest"));
        Assert.Equal(HttpStatusCode.Created, addGuestResponse.StatusCode);
        var secondDate = DateTime.Today.AddDays(17);
        var addDateResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/dates", new AddTeamAvailabilityDateRequest(secondDate, "SK Later", "Club", true));
        Assert.Equal(HttpStatusCode.Created, addDateResponse.StatusCode);

        var availability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        Assert.NotNull(availability);
        Assert.Equal(2, availability!.Dates.Count);
        Assert.Equal(2, availability.Players.Count);
        Assert.Equal(4, availability.Entries.Count);
        Assert.Contains(availability.Entries, entry => entry.PlayerUserId == assignableUser.Id && entry.MatchDate.Date == legacyDate);
        Assert.Contains(availability.Entries, entry => entry.PlayerName == "Legacy Guest" && entry.MatchDate.Date == legacyDate);
        Assert.Contains(availability.Entries, entry => entry.PlayerUserId == assignableUser.Id && entry.MatchDate.Date == secondDate);
        Assert.Contains(availability.Entries, entry => entry.PlayerName == "Legacy Guest" && entry.MatchDate.Date == secondDate);
    }

    [Fact]
    public async Task AvailabilityNormalization_DoesNotRunForUnauthorizedOrForbiddenReads()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var users = await client.GetFromJsonAsync<List<UserDto>>("/api/auth/users");
        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Availability Forbidden {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        var nonMember = users!.First(user => user.Roles.Contains("RegisteredUser"));

        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            context.TeamAvailabilityEntries.Add(new TeamAvailabilityEntry { TeamId = team.Id, PlayerName = "Legacy Guest", RoundNumber = 1, MatchDate = DateTime.Today.AddDays(6), OpponentTeam = "SK Forbidden", Location = "Club", IsHomeMatch = true, Status = AvailabilityStatus.Pending });
            await context.SaveChangesAsync();
        }

        var anonymousClient = _factory.CreateClient();
        var anonymousResponse = await anonymousClient.GetAsync($"/api/teamavailability/team/{team.Id}");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        var memberLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(nonMember.Email, "Player123!#"));
        var memberAuth = await memberLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(memberAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", memberAuth.Token);
        var forbiddenResponse = await client.GetAsync($"/api/teamavailability/team/{team.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenResponse.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            Assert.Empty(await context.TeamAvailabilityDates.Where(date => date.TeamId == team.Id).ToListAsync());
            Assert.Empty(await context.TeamAvailabilityPlayers.Where(player => player.TeamId == team.Id).ToListAsync());
            Assert.Single(await context.TeamAvailabilityEntries.Where(entry => entry.TeamId == team.Id).ToListAsync());
        }
    }

    [Fact]
    public async Task AvailabilityNormalization_IsIdempotentAndSkipsRemovedRegisteredPlayersForNewCells()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var assignableUser = await RegisterTestUserAsync(client);
        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Availability Normalize {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        var addMemberResponse = await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(assignableUser.Id));
        Assert.Equal(HttpStatusCode.OK, addMemberResponse.StatusCode);

        var firstDate = DateTime.Today.AddDays(8);
        var secondDate = DateTime.Today.AddDays(15);
        using (var scope = _factory.Services.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            context.TeamAvailabilityEntries.AddRange(
                new TeamAvailabilityEntry { TeamId = team.Id, PlayerUserId = assignableUser.Id, PlayerName = assignableUser.FullName, PlayerRating = assignableUser.ChessRating, RoundNumber = 1, MatchDate = firstDate, OpponentTeam = "SK First", Location = "Club", IsHomeMatch = true, Status = AvailabilityStatus.Pending },
                new TeamAvailabilityEntry { TeamId = team.Id, PlayerName = "Custom Legacy", RoundNumber = 1, MatchDate = firstDate, OpponentTeam = "SK First", Location = "Club", IsHomeMatch = true, Status = AvailabilityStatus.Pending },
                new TeamAvailabilityEntry { TeamId = team.Id, PlayerName = "Custom Legacy", RoundNumber = 2, MatchDate = secondDate, OpponentTeam = "SK Second", Location = "Club", IsHomeMatch = false, Status = AvailabilityStatus.Pending });
            await context.SaveChangesAsync();
        }

        var removeMemberResponse = await client.DeleteAsync($"/api/teams/{team.Id}/members/{assignableUser.Id}");
        Assert.Equal(HttpStatusCode.NoContent, removeMemberResponse.StatusCode);

        var firstRead = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        var secondRead = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        Assert.NotNull(firstRead);
        Assert.NotNull(secondRead);
        Assert.Equal(2, secondRead!.Dates.Count);
        Assert.Equal(2, secondRead.Players.Count);
        Assert.Equal(3, secondRead.Entries.Count);
        Assert.Contains(secondRead.Entries, entry => entry.PlayerName == "Custom Legacy" && entry.MatchDate.Date == secondDate);
        Assert.DoesNotContain(secondRead.Entries, entry => entry.PlayerUserId == assignableUser.Id && entry.MatchDate.Date == secondDate);
    }

    [Fact]
    public async Task TeamMember_CannotAddAvailabilityPlayerToTeam()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var member = await RegisterTestUserAsync(client);
        var target = await RegisterTestUserAsync(client);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Availability Auth {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        var addMemberResponse = await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(member.Id));
        Assert.Equal(HttpStatusCode.OK, addMemberResponse.StatusCode);

        var adminSearch = await client.GetFromJsonAsync<List<ExistingPlayerDto>>($"/api/teamavailability/players?teamId={team.Id}&query={Uri.EscapeDataString(target.FullName)}");
        Assert.NotNull(adminSearch);
        Assert.Contains(adminSearch!, player => player.UserId == target.Id && !player.IsTeamMember);

        var memberLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(member.Email, "Player123!#"));
        var memberAuth = await memberLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(memberAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", memberAuth.Token);

        var memberSearchForTarget = await client.GetFromJsonAsync<List<ExistingPlayerDto>>($"/api/teamavailability/players?teamId={team.Id}&query={Uri.EscapeDataString(target.FullName)}");
        Assert.NotNull(memberSearchForTarget);
        Assert.DoesNotContain(memberSearchForTarget!, player => player.UserId == target.Id);
        var memberSearchForSelf = await client.GetFromJsonAsync<List<ExistingPlayerDto>>($"/api/teamavailability/players?teamId={team.Id}&query={Uri.EscapeDataString(member.FullName)}");
        Assert.NotNull(memberSearchForSelf);
        Assert.Contains(memberSearchForSelf!, player => player.UserId == member.Id && player.IsTeamMember);

        var forbiddenResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(target.Id, null));
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenResponse.StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);
        var teamsAfterForbiddenAttempt = await client.GetFromJsonAsync<List<TeamDto>>("/api/teams");
        Assert.DoesNotContain(teamsAfterForbiddenAttempt!.Single(updatedTeam => updatedTeam.Id == team.Id).UserIds, userId => userId == target.Id);
    }

    [Fact]
    public async Task Admin_CanDeleteTeam_WithMembershipAndAvailabilityData()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var assignableUser = await RegisterTestUserAsync(client);
        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Delete Team {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        var addMemberResponse = await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(assignableUser.Id));
        Assert.Equal(HttpStatusCode.OK, addMemberResponse.StatusCode);
        var playerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(assignableUser.Id, null));
        Assert.Equal(HttpStatusCode.Created, playerResponse.StatusCode);
        var dateResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/dates", new AddTeamAvailabilityDateRequest(DateTime.Today.AddDays(4), "SK Delete", "Club", true));
        Assert.Equal(HttpStatusCode.Created, dateResponse.StatusCode);
        var competitionId = Guid.NewGuid();
        using (var setupScope = _factory.Services.CreateScope())
        {
            var setupContext = setupScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            setupContext.Competitions.Add(new Competition { Id = competitionId, TeamId = team.Id, Name = "Delete Team Competition", Season = "2026", League = "Test", Venue = "Club", StartDate = DateTime.Today, EndDate = DateTime.Today.AddDays(30) });
            await setupContext.SaveChangesAsync();
        }

        var deleteResponse = await client.DeleteAsync($"/api/teams/{team.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);
        var secondDeleteResponse = await client.DeleteAsync($"/api/teams/{team.Id}");
        Assert.Equal(HttpStatusCode.NotFound, secondDeleteResponse.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        Assert.False(await context.Teams.AnyAsync(t => t.Id == team.Id));
        Assert.False(await context.TeamMemberships.AnyAsync(m => m.TeamId == team.Id));
        Assert.False(await context.TeamAvailabilityDates.AnyAsync(date => date.TeamId == team.Id));
        Assert.False(await context.TeamAvailabilityPlayers.AnyAsync(player => player.TeamId == team.Id));
        Assert.False(await context.TeamAvailabilityEntries.AnyAsync(entry => entry.TeamId == team.Id));
        var competition = await context.Competitions.SingleAsync(competition => competition.Id == competitionId);
        Assert.Null(competition.TeamId);
    }

    [Fact]
    public async Task TeamMember_CannotDeleteTeam()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var assignableUser = await RegisterTestUserAsync(client);
        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Delete Denied {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(assignableUser.Id));

        var userLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(assignableUser.Email, "Player123!#"));
        var userAuth = await userLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(userAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", userAuth.Token);
        var forbiddenDelete = await client.DeleteAsync($"/api/teams/{team.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenDelete.StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);
        var teams = await client.GetFromJsonAsync<List<TeamDto>>("/api/teams");
        Assert.Contains(teams!, existingTeam => existingTeam.Id == team.Id);
    }

    [Fact]
    public async Task AvailabilityEntry_CannotBeUpdatedAfterMatchDate()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var assignableUser = await RegisterTestUserAsync(client);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Availability Closed {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);

        var playerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(assignableUser.Id, null));
        Assert.Equal(HttpStatusCode.Created, playerResponse.StatusCode);
        var pastDate = DateTime.Today.AddDays(-1);
        var dateResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/dates", new AddTeamAvailabilityDateRequest(pastDate, "SK Closed", "Club", true));
        Assert.Equal(HttpStatusCode.Created, dateResponse.StatusCode);

        var availability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        var closedEntry = availability!.Entries.Single(entry => entry.PlayerUserId == assignableUser.Id && entry.MatchDate.Date == pastDate);
        Assert.True(availability.Dates.Single(date => date.MatchDate.Date == pastDate).IsClosed);

        var userLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(assignableUser.Email, "Player123!#"));
        var userAuth = await userLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(userAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", userAuth.Token);
        var selfUpdateResponse = await client.PutAsJsonAsync($"/api/teamavailability/entries/{closedEntry.Id}/self", new UpdateOwnTeamAvailabilityRequest(AvailabilityStatus.Available, false, null));
        Assert.Equal(HttpStatusCode.BadRequest, selfUpdateResponse.StatusCode);
        using (var selfUpdateError = JsonDocument.Parse(await selfUpdateResponse.Content.ReadAsStringAsync()))
        {
            Assert.Equal("Availability is closed for this match date.", selfUpdateError.RootElement.GetProperty("message").GetString());
        }

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);
        var adminUpdateResponse = await client.PutAsJsonAsync($"/api/teamavailability/entries/{closedEntry.Id}", new UpsertTeamAvailabilityEntryRequest(closedEntry.PlayerUserId, closedEntry.PlayerName, closedEntry.PlayerRating, closedEntry.RoundNumber, closedEntry.MatchDate, closedEntry.OpponentTeam, closedEntry.Location, closedEntry.IsHomeMatch, AvailabilityStatus.Available, true, "closed"));
        Assert.Equal(HttpStatusCode.BadRequest, adminUpdateResponse.StatusCode);
        using (var adminUpdateError = JsonDocument.Parse(await adminUpdateResponse.Content.ReadAsStringAsync()))
        {
            Assert.Equal("Availability is closed for this match date.", adminUpdateError.RootElement.GetProperty("message").GetString());
        }

        var unchangedAvailability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        var unchangedEntry = unchangedAvailability!.Entries.Single(entry => entry.Id == closedEntry.Id);
        Assert.Equal(AvailabilityStatus.Pending, unchangedEntry.Status);
        Assert.False(unchangedEntry.IsDriver);
        Assert.Null(unchangedEntry.Notes);

        var today = DateTime.Today;
        var todayDateResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/dates", new AddTeamAvailabilityDateRequest(today, "SK Today", "Club", true));
        Assert.Equal(HttpStatusCode.Created, todayDateResponse.StatusCode);
        var todayAvailability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        var todayEntry = todayAvailability!.Entries.Single(entry => entry.PlayerUserId == assignableUser.Id && entry.MatchDate.Date == today);
        Assert.False(todayAvailability.Dates.Single(date => date.MatchDate.Date == today).IsClosed);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", userAuth.Token);
        var todaySelfUpdate = await client.PutAsJsonAsync($"/api/teamavailability/entries/{todayEntry.Id}/self", new UpdateOwnTeamAvailabilityRequest(AvailabilityStatus.Available, false, null));
        Assert.Equal(HttpStatusCode.NoContent, todaySelfUpdate.StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);
        var todayAdminUpdate = await client.PutAsJsonAsync($"/api/teamavailability/entries/{todayEntry.Id}", new UpsertTeamAvailabilityEntryRequest(todayEntry.PlayerUserId, todayEntry.PlayerName, todayEntry.PlayerRating, todayEntry.RoundNumber, todayEntry.MatchDate, todayEntry.OpponentTeam, todayEntry.Location, todayEntry.IsHomeMatch, AvailabilityStatus.Tentative, true, "today"));
        Assert.Equal(HttpStatusCode.NoContent, todayAdminUpdate.StatusCode);

        var updatedTodayAvailability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        var updatedTodayEntry = updatedTodayAvailability!.Entries.Single(entry => entry.Id == todayEntry.Id);
        Assert.Equal(AvailabilityStatus.Tentative, updatedTodayEntry.Status);
        Assert.True(updatedTodayEntry.IsDriver);
        Assert.Equal("today", updatedTodayEntry.Notes);
    }

    [Fact]
    public async Task DevelopmentSeed_ContainsAtLeastTwentyPlayersAndFiveArticles()
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        Assert.True(await context.Users.CountAsync() >= 20);
        Assert.True(await context.Articles.CountAsync() >= 5);
    }

    [Fact]
    public async Task AnonymousUser_CannotPostArticle_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();
        var form = new MultipartFormDataContent
        {
            { new StringContent("Test Article Title"), "Title" },
            { new StringContent("Content of test article"), "Content" }
        };

        var response = await client.PostAsync("/api/articles", form);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AdminLogin_Succeeds_AndReceivesToken()
    {
        var client = _factory.CreateClient();
        var loginReq = new LoginRequest("admin@chessweb.local", "Admin123!#");

        var response = await client.PostAsJsonAsync("/api/auth/login", loginReq);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var authRes = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(authRes);
        Assert.NotNull(authRes.Token);
        Assert.Contains("Admin", authRes.User.Roles);
    }

    [Fact]
    public async Task RegisteredUser_CanPostCommentAndReaction_OnArticle()
    {
        // 1. Login as a registered user
        var client = _factory.CreateClient();
        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("anna.novakova@chessweb.local", "Player123!#"));
        var authRes = await loginRes.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(authRes);

        var authedClient = _factory.CreateClient();
        authedClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authRes.Token);

        // 2. Create a test article
        var form = new MultipartFormDataContent
        {
            { new StringContent($"Analysis for Test {Guid.NewGuid()}"), "Title" },
            { new StringContent("Content for comments and reactions testing"), "Content" }
        };
        var createRes = await authedClient.PostAsync("/api/articles", form);
        Assert.Equal(HttpStatusCode.Created, createRes.StatusCode);
        var createdArticle = await createRes.Content.ReadFromJsonAsync<ArticleDto>();
        Assert.NotNull(createdArticle);

        // 3. Post a comment
        var commentReq = new CreateCommentRequest("Brilliant attacking play in this game!");
        var commentRes = await authedClient.PostAsJsonAsync($"/api/articles/{createdArticle.Id}/comments", commentReq);
        Assert.Equal(HttpStatusCode.OK, commentRes.StatusCode);
        var commentDto = await commentRes.Content.ReadFromJsonAsync<ArticleCommentDto>();
        Assert.NotNull(commentDto);
        Assert.Equal("Brilliant attacking play in this game!", commentDto.Content);

        // 4. Toggle a reaction (Chess piece emoji ♟️) -> ON
        var reactionReq = new ToggleReactionRequest(ChessWeb.Domain.Entities.ArticleReactionType.Chess);
        var reactionRes = await authedClient.PostAsJsonAsync($"/api/articles/{createdArticle.Id}/reactions", reactionReq);
        Assert.Equal(HttpStatusCode.OK, reactionRes.StatusCode);
        var reactionSummaries = await reactionRes.Content.ReadFromJsonAsync<List<ReactionSummaryDto>>();
        Assert.NotNull(reactionSummaries);
        var chessReaction = reactionSummaries.First(r => r.ReactionType == ChessWeb.Domain.Entities.ArticleReactionType.Chess);
        Assert.Equal(1, chessReaction.Count);
        Assert.True(chessReaction.UserReacted);

        // 5. Toggle reaction -> OFF
        var reactionOffRes = await authedClient.PostAsJsonAsync($"/api/articles/{createdArticle.Id}/reactions", reactionReq);
        Assert.Equal(HttpStatusCode.OK, reactionOffRes.StatusCode);
        var reactionOffSummaries = await reactionOffRes.Content.ReadFromJsonAsync<List<ReactionSummaryDto>>();
        var chessOffReaction = reactionOffSummaries!.First(r => r.ReactionType == ChessWeb.Domain.Entities.ArticleReactionType.Chess);
        Assert.Equal(0, chessOffReaction.Count);
        Assert.False(chessOffReaction.UserReacted);
    }

    [Fact]
    public async Task ArticleAuthor_CanUpdateArticle()
    {
        var client = _factory.CreateClient();

        // 1. Admin login (author of seeded article)
        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var authRes = await loginRes.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(authRes);

        var adminClient = _factory.CreateClient();
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authRes.Token);

        // 2. Get the seeded article
        var articlesRes = await adminClient.GetAsync("/api/articles?search=Immortal&pageSize=50");
        var paged = await articlesRes.Content.ReadFromJsonAsync<PagedResult<ArticleDto>>();
        var article = paged!.Items.First(a => a.AuthorId == authRes.User.Id);

        // 3. Update article
        var updateReq = new UpdateArticleRequest(
            Title: "Immortal Game: Adolf Anderssen (Annotated)",
            Content: "Updated content with deep engine and historical annotations."
        );

        var putRes = await adminClient.PutAsJsonAsync($"/api/articles/{article.Id}", updateReq);
        Assert.Equal(HttpStatusCode.OK, putRes.StatusCode);
        var updatedArticle = await putRes.Content.ReadFromJsonAsync<ArticleDto>();
        Assert.NotNull(updatedArticle);
        Assert.Equal("Immortal Game: Adolf Anderssen (Annotated)", updatedArticle.Title);
    }

    [Fact]
    public async Task Admin_CanCreateRecurringEvents_And_DeleteSeries()
    {
        var client = _factory.CreateClient();

        // 1. Admin login
        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var authRes = await loginRes.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(authRes);

        var adminClient = _factory.CreateClient();
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authRes.Token);

        // 2. Create weekly recurring club night (4 occurrences)
        var createReq = new CreateCalendarEventRequest(
            Title: "Weekly Blitz Club Night",
            Description: "Regular Friday blitz games",
            Location: "Prague Chess Club",
            StartTime: new DateTime(2026, 10, 2, 18, 0, 0, DateTimeKind.Utc),
            EndTime: new DateTime(2026, 10, 2, 21, 0, 0, DateTimeKind.Utc),
            IsAllDay: false,
            Category: ChessWeb.Domain.Entities.CalendarEventCategory.ClubNight,
            Recurrence: ChessWeb.Domain.Entities.RecurrenceType.Weekly,
            RecurrenceCount: 4
        );

        var postRes = await adminClient.PostAsJsonAsync("/api/calendar/events", createReq);
        Assert.Equal(HttpStatusCode.OK, postRes.StatusCode);

        var createdEvents = await postRes.Content.ReadFromJsonAsync<List<ChessWeb.Domain.Entities.CalendarEvent>>();
        Assert.NotNull(createdEvents);
        Assert.Equal(4, createdEvents.Count);

        var seriesId = createdEvents.First().RecurrenceGroupId;
        Assert.NotNull(seriesId);

        // Verify weekly intervals
        Assert.Equal(new DateTime(2026, 10, 2, 18, 0, 0, DateTimeKind.Utc), createdEvents[0].StartTime);
        Assert.Equal(new DateTime(2026, 10, 9, 18, 0, 0, DateTimeKind.Utc), createdEvents[1].StartTime);
        Assert.Equal(new DateTime(2026, 10, 16, 18, 0, 0, DateTimeKind.Utc), createdEvents[2].StartTime);
        Assert.Equal(new DateTime(2026, 10, 23, 18, 0, 0, DateTimeKind.Utc), createdEvents[3].StartTime);

        // 3. Delete entire series
        var deleteRes = await adminClient.DeleteAsync($"/api/calendar/events/{createdEvents[0].Id}?deleteSeries=true");
        Assert.Equal(HttpStatusCode.NoContent, deleteRes.StatusCode);

        // 4. Verify all are deleted
        var getRes = await adminClient.GetAsync("/api/calendar/events");
        var allEvents = await getRes.Content.ReadFromJsonAsync<List<ChessWeb.Domain.Entities.CalendarEvent>>();
        Assert.DoesNotContain(allEvents!, e => e.RecurrenceGroupId == seriesId);
    }

    [Fact]
    public async Task AnonymousUser_CanExportEventIcs()
    {
        var client = _factory.CreateClient();
        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var authRes = await loginRes.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(authRes);
        var adminClient = _factory.CreateClient();
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authRes.Token);

        var createReq = new CreateCalendarEventRequest(
            Title: "ICS Export Test Event",
            Description: "Testing single event ICS export",
            Location: "Test Venue",
            StartTime: new DateTime(2026, 11, 5, 18, 0, 0, DateTimeKind.Utc),
            EndTime: new DateTime(2026, 11, 5, 20, 0, 0, DateTimeKind.Utc),
            IsAllDay: false,
            Category: ChessWeb.Domain.Entities.CalendarEventCategory.ClubNight
        );
        var postRes = await adminClient.PostAsJsonAsync("/api/calendar/events", createReq);
        var createdEvents = await postRes.Content.ReadFromJsonAsync<List<ChessWeb.Domain.Entities.CalendarEvent>>();
        Assert.NotNull(createdEvents);
        var eventId = createdEvents!.Single().Id;

        var icsRes = await client.GetAsync($"/api/calendar/events/{eventId}/ics");
        Assert.Equal(HttpStatusCode.OK, icsRes.StatusCode);
        Assert.Equal("text/calendar", icsRes.Content.Headers.ContentType?.MediaType);

        var body = await icsRes.Content.ReadAsStringAsync();
        Assert.Contains("BEGIN:VCALENDAR", body);
        Assert.Contains("BEGIN:VEVENT", body);
        Assert.Contains("ICS Export Test Event", body);
    }

    [Fact]
    public async Task AnonymousUser_ExportEventIcs_ReturnsNotFoundForUnknownId()
    {
        var client = _factory.CreateClient();
        var icsRes = await client.GetAsync($"/api/calendar/events/{Guid.NewGuid()}/ics");
        Assert.Equal(HttpStatusCode.NotFound, icsRes.StatusCode);
    }

    [Fact]
    public async Task AnonymousUser_CanExportSeriesIcs_WithOneVEventPerOccurrence()
    {
        var client = _factory.CreateClient();
        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var authRes = await loginRes.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(authRes);
        var adminClient = _factory.CreateClient();
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authRes.Token);

        var createReq = new CreateCalendarEventRequest(
            Title: "ICS Series Export Test",
            Description: "Testing series ICS export",
            Location: "Test Venue",
            StartTime: new DateTime(2026, 11, 6, 18, 0, 0, DateTimeKind.Utc),
            EndTime: new DateTime(2026, 11, 6, 21, 0, 0, DateTimeKind.Utc),
            IsAllDay: false,
            Category: ChessWeb.Domain.Entities.CalendarEventCategory.ClubNight,
            Recurrence: ChessWeb.Domain.Entities.RecurrenceType.Weekly,
            RecurrenceCount: 3
        );
        var postRes = await adminClient.PostAsJsonAsync("/api/calendar/events", createReq);
        var createdEvents = await postRes.Content.ReadFromJsonAsync<List<ChessWeb.Domain.Entities.CalendarEvent>>();
        Assert.NotNull(createdEvents);
        Assert.Equal(3, createdEvents!.Count);
        var seriesId = createdEvents[0].RecurrenceGroupId;
        Assert.NotNull(seriesId);

        var icsRes = await client.GetAsync($"/api/calendar/events/series/{seriesId}/ics");
        Assert.Equal(HttpStatusCode.OK, icsRes.StatusCode);
        Assert.Equal("text/calendar", icsRes.Content.Headers.ContentType?.MediaType);

        var body = await icsRes.Content.ReadAsStringAsync();
        Assert.Equal(3, Regex.Matches(body, "BEGIN:VEVENT").Count);
    }

    [Fact]
    public async Task ExportSeriesIcs_ReturnsNotFoundWhenNoEventsShareGroupId()
    {
        var client = _factory.CreateClient();
        var icsRes = await client.GetAsync($"/api/calendar/events/series/{Guid.NewGuid()}/ics");
        Assert.Equal(HttpStatusCode.NotFound, icsRes.StatusCode);
    }

    [Fact]
    public async Task DbInitializer_SeedsJmssChessFeed_AsInactive()
    {
        using var scope = _factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var feed = await context.CalendarFeeds.FirstOrDefaultAsync(f => f.Url == "https://jmsschess.cz/feed/");
        Assert.NotNull(feed);
        Assert.False(feed!.IsActive);
        Assert.Equal(FeedType.RssFeed, feed.Type);
    }

    [Fact]
    public async Task Admin_CanManagePartners()
    {
        var client = _factory.CreateClient();

        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        Assert.Equal(HttpStatusCode.OK, loginRes.StatusCode);
        var authRes = await loginRes.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(authRes);

        var adminClient = _factory.CreateClient();
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authRes.Token);

        var listBefore = await adminClient.GetAsync("/api/partners");
        Assert.Equal(HttpStatusCode.OK, listBefore.StatusCode);

        var addReq = new
        {
            name = "Chess Club Partner",
            url = "https://example.com/chess-club",
            logoUrl = "https://example.com/logo.png",
            isActive = true
        };

        var addRes = await adminClient.PostAsJsonAsync("/api/partners", addReq);
        Assert.Equal(HttpStatusCode.OK, addRes.StatusCode);
        using var document = JsonDocument.Parse(await addRes.Content.ReadAsStringAsync());
        Assert.Equal("Chess Club Partner", document.RootElement.GetProperty("name").GetString());
        Assert.Equal("https://example.com/chess-club", document.RootElement.GetProperty("url").GetString());
        Assert.Equal("https://example.com/logo.png", document.RootElement.GetProperty("logoUrl").GetString());

        var partnerId = document.RootElement.GetProperty("id").GetGuid();

        var listAfter = await adminClient.GetAsync("/api/partners");
        Assert.Equal(HttpStatusCode.OK, listAfter.StatusCode);
        var listJson = JsonDocument.Parse(await listAfter.Content.ReadAsStringAsync());
        Assert.Contains(listJson.RootElement.EnumerateArray(), p => p.GetProperty("id").GetGuid() == partnerId);

        var deleteRes = await adminClient.DeleteAsync($"/api/partners/{partnerId}");
        Assert.Equal(HttpStatusCode.NoContent, deleteRes.StatusCode);

        var listFinal = await adminClient.GetAsync("/api/partners");
        var finalJson = JsonDocument.Parse(await listFinal.Content.ReadAsStringAsync());
        Assert.DoesNotContain(finalJson.RootElement.EnumerateArray(), p => p.GetProperty("id").GetGuid() == partnerId);
    }

    [Fact]
    public async Task Admin_CanUploadPartnerLogoToServer()
    {
        var client = _factory.CreateClient();

        var loginRes = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        Assert.Equal(HttpStatusCode.OK, loginRes.StatusCode);
        var authRes = await loginRes.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(authRes);

        var adminClient = _factory.CreateClient();
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authRes.Token);

        using var fileContent = new ByteArrayContent(new byte[] { 1, 2, 3, 4 });
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/png");

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent("Test Partner"), "name");
        form.Add(new StringContent("https://example.com/test-partner"), "url");
        form.Add(new StringContent("true"), "isActive");
        form.Add(fileContent, "logoFile", "logo.png");

        var addRes = await adminClient.PostAsync("/api/partners/upload", form);
        Assert.Equal(HttpStatusCode.OK, addRes.StatusCode);

        using var document = JsonDocument.Parse(await addRes.Content.ReadAsStringAsync());
        var logoUrl = document.RootElement.GetProperty("logoUrl").GetString();
        Assert.NotNull(logoUrl);
        Assert.Contains("/api/partners/", logoUrl!);

        var partnerId = document.RootElement.GetProperty("id").GetGuid();
        var logoRes = await adminClient.GetAsync($"/api/partners/{partnerId}/logo");
        Assert.Equal(HttpStatusCode.OK, logoRes.StatusCode);
        Assert.Equal("image/png", logoRes.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Admin_CanRemoveAllRolesFromAnotherUser()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var users = await client.GetFromJsonAsync<List<UserDto>>("/api/auth/users");
        var target = users!.First(user => user.Roles.Contains("RegisteredUser") && user.Email != "admin@chessweb.local");

        var changeRolesResponse = await client.PostAsJsonAsync("/api/auth/change-roles", new ChangeRoleRequest(target.Id, new List<string>()));
        Assert.Equal(HttpStatusCode.OK, changeRolesResponse.StatusCode);

        var usersAfter = await client.GetFromJsonAsync<List<UserDto>>("/api/auth/users");
        var updatedTarget = usersAfter!.Single(user => user.Id == target.Id);
        Assert.Empty(updatedTarget.Roles);

        // restore state for other tests relying on seeded RegisteredUser role
        var restoreResponse = await client.PostAsJsonAsync("/api/auth/change-roles", new ChangeRoleRequest(target.Id, new List<string> { "RegisteredUser" }));
        Assert.Equal(HttpStatusCode.OK, restoreResponse.StatusCode);
    }

    [Fact]
    public async Task Admin_CannotRemoveOwnAdminRole()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var changeRolesResponse = await client.PostAsJsonAsync("/api/auth/change-roles", new ChangeRoleRequest(adminAuth.User.Id, new List<string> { "RegisteredUser" }));
        Assert.Equal(HttpStatusCode.BadRequest, changeRolesResponse.StatusCode);

        var usersAfter = await client.GetFromJsonAsync<List<UserDto>>("/api/auth/users");
        var adminUser = usersAfter!.Single(user => user.Id == adminAuth.User.Id);
        Assert.Contains("Admin", adminUser.Roles);
    }

    [Fact]
    public async Task ChangeRoles_RejectsUnknownRoleName()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var users = await client.GetFromJsonAsync<List<UserDto>>("/api/auth/users");
        var target = users!.First(user => user.Roles.Contains("RegisteredUser") && user.Email != "admin@chessweb.local");

        var changeRolesResponse = await client.PostAsJsonAsync("/api/auth/change-roles", new ChangeRoleRequest(target.Id, new List<string> { "SuperUser" }));
        Assert.Equal(HttpStatusCode.BadRequest, changeRolesResponse.StatusCode);
    }

    [Fact]
    public async Task NonSuperAdmin_CannotGrantSuperAdminRole()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var users = await client.GetFromJsonAsync<List<UserDto>>("/api/auth/users");
        var target = users!.First(user => user.Roles.Contains("RegisteredUser") && user.Email != "admin@chessweb.local");

        var changeRolesResponse = await client.PostAsJsonAsync(
            "/api/auth/change-roles",
            new ChangeRoleRequest(target.Id, new List<string> { "RegisteredUser", "SuperAdmin" }));
        Assert.Equal(HttpStatusCode.Forbidden, changeRolesResponse.StatusCode);
    }

    [Fact]
    public async Task SuperAdmin_CannotGrantSuperAdminRole_WhenAnotherHolderExists()
    {
        var client = _factory.CreateClient();
        var superAdminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("superadmin@chessweb.local", "SuperAdmin123!#"));
        var superAdminAuth = await superAdminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(superAdminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", superAdminAuth.Token);

        var users = await client.GetFromJsonAsync<List<UserDto>>("/api/auth/users");
        var target = users!.First(user => user.Roles.Contains("RegisteredUser") && user.Email != "superadmin@chessweb.local");

        var changeRolesResponse = await client.PostAsJsonAsync(
            "/api/auth/change-roles",
            new ChangeRoleRequest(target.Id, new List<string> { "RegisteredUser", "SuperAdmin" }));
        Assert.Equal(HttpStatusCode.Conflict, changeRolesResponse.StatusCode);
    }

    [Fact]
    public async Task SuperAdmin_CannotRemoveOwnSuperAdminRole_WhenSoleHolder()
    {
        var client = _factory.CreateClient();
        var superAdminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("superadmin@chessweb.local", "SuperAdmin123!#"));
        var superAdminAuth = await superAdminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(superAdminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", superAdminAuth.Token);

        var changeRolesResponse = await client.PostAsJsonAsync(
            "/api/auth/change-roles",
            new ChangeRoleRequest(superAdminAuth.User.Id, new List<string>()));
        Assert.Equal(HttpStatusCode.BadRequest, changeRolesResponse.StatusCode);

        var usersAfter = await client.GetFromJsonAsync<List<UserDto>>("/api/auth/users");
        var superAdminUser = usersAfter!.Single(user => user.Id == superAdminAuth.User.Id);
        Assert.Contains("SuperAdmin", superAdminUser.Roles);
    }

    [Fact]
    public async Task Admin_CanUpdatePlayer_ViaPlayerEndpoint()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"player-update-{Guid.NewGuid()}@chessweb.local", "Player123!#", "Original Name", "1500", null, null));
        var registerAuth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(registerAuth);

        var newEmail = $"updated-{Guid.NewGuid()}@chessweb.local";
        var updateResponse = await client.PutAsJsonAsync(
            $"/api/player/{registerAuth!.User.Id}",
            new UpdatePlayerRequest("Updated Name", newEmail, "1600", "9999999", null));
        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        var updated = await updateResponse.Content.ReadFromJsonAsync<UserDto>();
        Assert.NotNull(updated);
        Assert.Equal("Updated Name", updated!.FullName);
        Assert.Equal(newEmail, updated.Email);
        Assert.Equal("1600", updated.ChessRating);
        Assert.Equal("9999999", updated.FideId);
    }

    [Fact]
    public async Task UpdatePlayer_ReturnsNotFound_ForUnknownUser()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var updateResponse = await client.PutAsJsonAsync(
            $"/api/player/{Guid.NewGuid()}",
            new UpdatePlayerRequest("Nobody", "nobody@chessweb.local", null, null, null));
        Assert.Equal(HttpStatusCode.NotFound, updateResponse.StatusCode);
    }

    [Fact]
    public async Task UpdatePlayer_ReturnsConflict_ForDuplicateEmail()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"dup-target-{Guid.NewGuid()}@chessweb.local", "Player123!#", "Dup Target", null, null, null));
        var registerAuth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(registerAuth);

        var updateResponse = await client.PutAsJsonAsync(
            $"/api/player/{registerAuth!.User.Id}",
            new UpdatePlayerRequest("Dup Target", "admin@chessweb.local", null, null, null));
        Assert.Equal(HttpStatusCode.Conflict, updateResponse.StatusCode);
    }

    [Fact]
    public async Task UpdatePlayer_ReturnsBadRequest_ForInvalidEmailOrEmptyName()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"invalid-input-{Guid.NewGuid()}@chessweb.local", "Player123!#", "Invalid Input", null, null, null));
        var registerAuth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(registerAuth);

        var invalidEmailResponse = await client.PutAsJsonAsync(
            $"/api/player/{registerAuth!.User.Id}",
            new UpdatePlayerRequest("Invalid Input", "not-an-email", null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, invalidEmailResponse.StatusCode);

        var emptyNameResponse = await client.PutAsJsonAsync(
            $"/api/player/{registerAuth.User.Id}",
            new UpdatePlayerRequest("", registerAuth.User.Email, null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, emptyNameResponse.StatusCode);
    }

    [Fact]
    public async Task UpdatePlayer_ReturnsForbidden_ForNonAdminCaller()
    {
        var client = _factory.CreateClient();
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("anna.novakova@chessweb.local", "Player123!#"));
        var authResponse = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(authResponse);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authResponse.Token);

        var updateResponse = await client.PutAsJsonAsync(
            $"/api/player/{authResponse!.User.Id}",
            new UpdatePlayerRequest("Anna Novakova", authResponse.User.Email, "1985", null, null));
        Assert.Equal(HttpStatusCode.Forbidden, updateResponse.StatusCode);
    }

    [Fact]
    public async Task Captain_CanManageOtherPlayersEntry_ButPlainTeamMemberCannot()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var captain = await RegisterTestUserAsync(client);
        var target = await RegisterTestUserAsync(client);
        var plainMember = await RegisterTestUserAsync(client);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Captain Permission {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        foreach (var member in new[] { captain, target, plainMember })
        {
            Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(member.Id))).StatusCode);
        }

        var assignCaptainResponse = await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/captain", new AssignTeamCaptainRequest(captain.Id));
        Assert.Equal(HttpStatusCode.NoContent, assignCaptainResponse.StatusCode);

        var targetPlayerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(target.Id, null));
        Assert.Equal(HttpStatusCode.Created, targetPlayerResponse.StatusCode);
        var dateResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/dates", new AddTeamAvailabilityDateRequest(DateTime.UtcNow.AddDays(10), "SK Captain", "Club", true));
        Assert.Equal(HttpStatusCode.Created, dateResponse.StatusCode);

        var availability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        var targetEntry = availability!.Entries.Single(entry => entry.PlayerUserId == target.Id);

        var captainLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(captain.Email, "Player123!#"));
        var captainAuth = await captainLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(captainAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", captainAuth.Token);

        var captainUpdateResponse = await client.PutAsJsonAsync($"/api/teamavailability/entries/{targetEntry.Id}", new UpsertTeamAvailabilityEntryRequest(targetEntry.PlayerUserId, targetEntry.PlayerName, targetEntry.PlayerRating, targetEntry.RoundNumber, targetEntry.MatchDate, targetEntry.OpponentTeam, targetEntry.Location, targetEntry.IsHomeMatch, AvailabilityStatus.Available, false, "set by captain"));
        Assert.Equal(HttpStatusCode.NoContent, captainUpdateResponse.StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);
        var afterCaptainUpdate = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        var updatedEntry = afterCaptainUpdate!.Entries.Single(entry => entry.Id == targetEntry.Id);
        Assert.Equal(AvailabilityStatus.Available, updatedEntry.Status);
        Assert.Equal("set by captain", updatedEntry.Notes);

        var memberLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(plainMember.Email, "Player123!#"));
        var memberAuth = await memberLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(memberAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", memberAuth.Token);

        var memberUpdateResponse = await client.PutAsJsonAsync($"/api/teamavailability/entries/{targetEntry.Id}", new UpsertTeamAvailabilityEntryRequest(targetEntry.PlayerUserId, targetEntry.PlayerName, targetEntry.PlayerRating, targetEntry.RoundNumber, targetEntry.MatchDate, targetEntry.OpponentTeam, targetEntry.Location, targetEntry.IsHomeMatch, AvailabilityStatus.Unavailable, false, "set by plain member"));
        Assert.Equal(HttpStatusCode.Forbidden, memberUpdateResponse.StatusCode);
    }

    [Fact]
    public async Task MatchPlayerTag_LimitedToThreePerTeamForTheSeason()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Tag Limit {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);

        var players = new List<TeamAvailabilityPlayerDto>();
        foreach (var name in new[] { "Tag Player One", "Tag Player Two", "Tag Player Three", "Tag Player Four" })
        {
            var response = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, name));
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            players.Add((await response.Content.ReadFromJsonAsync<TeamAvailabilityPlayerDto>())!);
        }

        async Task<HttpResponseMessage> TagPlayerAsync(TeamAvailabilityPlayerDto player, MatchPlayerTag tag) =>
            await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/players/{player.Id}/tag", new UpdateTagRequest(tag));

        Assert.Equal(HttpStatusCode.NoContent, (await TagPlayerAsync(players[0], MatchPlayerTag.Cizinec)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await TagPlayerAsync(players[1], MatchPlayerTag.Host)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await TagPlayerAsync(players[2], MatchPlayerTag.Vyssi)).StatusCode);

        // A tagged player can still be re-tagged without hitting the limit against itself.
        Assert.Equal(HttpStatusCode.NoContent, (await TagPlayerAsync(players[0], MatchPlayerTag.Host)).StatusCode);

        var fourthResponse = await TagPlayerAsync(players[3], MatchPlayerTag.Cizinec);
        Assert.Equal(HttpStatusCode.BadRequest, fourthResponse.StatusCode);
        using (var errorDocument = JsonDocument.Parse(await fourthResponse.Content.ReadAsStringAsync()))
        {
            Assert.Equal("Maximum of 3 tagged players (Cizinec/Host/Vy\u0161\u0161\u00ed) per team for the season.", errorDocument.RootElement.GetProperty("message").GetString());
        }

        // Untagging frees a slot for a new player to be tagged (season, not per-match, semantics).
        Assert.Equal(HttpStatusCode.NoContent, (await TagPlayerAsync(players[1], MatchPlayerTag.None)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await TagPlayerAsync(players[3], MatchPlayerTag.Cizinec)).StatusCode);
    }

    [Fact]
    public async Task PlayerTag_RequiresCaptainOrAdmin()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var captain = await RegisterTestUserAsync(client);
        var plainMember = await RegisterTestUserAsync(client);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Tag Permission {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(captain.Id));
        await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(plainMember.Id));
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/captain", new AssignTeamCaptainRequest(captain.Id))).StatusCode);

        var playerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Tag Candidate"));
        var player = await playerResponse.Content.ReadFromJsonAsync<TeamAvailabilityPlayerDto>();
        Assert.NotNull(player);

        var memberLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(plainMember.Email, "Player123!#"));
        var memberAuth = await memberLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(memberAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", memberAuth.Token);
        var forbiddenResponse = await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/players/{player!.Id}/tag", new UpdateTagRequest(MatchPlayerTag.Host));
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenResponse.StatusCode);

        var captainLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(captain.Email, "Player123!#"));
        var captainAuth = await captainLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(captainAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", captainAuth.Token);
        var captainResponse = await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/players/{player.Id}/tag", new UpdateTagRequest(MatchPlayerTag.Host));
        Assert.Equal(HttpStatusCode.NoContent, captainResponse.StatusCode);
    }

    [Fact]
    public async Task AddPlayer_EnforcesThreeTagLimit_WhenTaggedAtCreation()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Tag Limit Creation {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);

        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Creation Tag One", false, MatchPlayerTag.Cizinec))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Creation Tag Two", false, MatchPlayerTag.Host))).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Creation Tag Three", false, MatchPlayerTag.Vyssi))).StatusCode);

        var fourthResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Creation Tag Four", false, MatchPlayerTag.Cizinec));
        Assert.Equal(HttpStatusCode.BadRequest, fourthResponse.StatusCode);
        using (var errorDocument = JsonDocument.Parse(await fourthResponse.Content.ReadAsStringAsync()))
        {
            Assert.Equal("Maximum of 3 tagged players (Cizinec/Host/Vy\u0161\u0161\u00ed) per team for the season.", errorDocument.RootElement.GetProperty("message").GetString());
        }

        // An untagged 4th player is still allowed since the limit only applies to tagged players.
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Creation No Tag"))).StatusCode);
    }

    [Fact]
    public async Task SeasonReport_ReturnsMatchesPlayedAndMeetsMinimum_ForZakladPlayers()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Season Report {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);

        var seasonStart = DateTime.UtcNow.AddDays(1).Date;
        var seasonEnd = DateTime.UtcNow.AddDays(30).Date;
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/season", new UpdateTeamSeasonRequest(seasonStart, seasonEnd))).StatusCode);

        var regularPlayerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Base Regular"));
        var regularPlayer = await regularPlayerResponse.Content.ReadFromJsonAsync<TeamAvailabilityPlayerDto>();
        var occasionalPlayerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Base Occasional"));
        var occasionalPlayer = await occasionalPlayerResponse.Content.ReadFromJsonAsync<TeamAvailabilityPlayerDto>();
        Assert.NotNull(regularPlayer);
        Assert.NotNull(occasionalPlayer);

        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/players/{regularPlayer!.Id}/zaklad", new UpdateZakladRequest(true))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/players/{occasionalPlayer!.Id}/zaklad", new UpdateZakladRequest(true))).StatusCode);

        var matchDates = new[] { seasonStart.AddDays(2), seasonStart.AddDays(9), seasonStart.AddDays(16) };
        foreach (var matchDate in matchDates)
        {
            Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/dates", new AddTeamAvailabilityDateRequest(matchDate, "SK Season", "Club", true))).StatusCode);
        }

        var availability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        var regularEntries = availability!.Entries.Where(entry => entry.PlayerName == "Base Regular").OrderBy(entry => entry.MatchDate).ToList();
        var occasionalEntries = availability.Entries.Where(entry => entry.PlayerName == "Base Occasional").OrderBy(entry => entry.MatchDate).ToList();
        Assert.Equal(3, regularEntries.Count);
        Assert.Equal(3, occasionalEntries.Count);

        async Task MarkAvailableAsync(TeamAvailabilityEntryDto entry) =>
            Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync($"/api/teamavailability/entries/{entry.Id}", new UpsertTeamAvailabilityEntryRequest(entry.PlayerUserId, entry.PlayerName, entry.PlayerRating, entry.RoundNumber, entry.MatchDate, entry.OpponentTeam, entry.Location, entry.IsHomeMatch, AvailabilityStatus.Available, false, null))).StatusCode);

        await MarkAvailableAsync(regularEntries[0]);
        await MarkAvailableAsync(regularEntries[1]);
        await MarkAvailableAsync(occasionalEntries[0]);

        var report = await client.GetFromJsonAsync<List<SeasonReportEntryDto>>($"/api/teamavailability/team/{team.Id}/season-report");
        Assert.NotNull(report);
        var regularReport = report!.Single(entry => entry.PlayerId == regularPlayer.Id);
        var occasionalReport = report.Single(entry => entry.PlayerId == occasionalPlayer.Id);
        Assert.Equal(2, regularReport.MatchesPlayed);
        Assert.True(regularReport.MeetsMinimum);
        Assert.Equal(1, occasionalReport.MatchesPlayed);
        Assert.False(occasionalReport.MeetsMinimum);
    }

    [Fact]
    public async Task ZakladToggle_RequiresCaptainOrAdmin()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var captain = await RegisterTestUserAsync(client);
        var plainMember = await RegisterTestUserAsync(client);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Zaklad Permission {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(captain.Id));
        await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(plainMember.Id));
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/captain", new AssignTeamCaptainRequest(captain.Id))).StatusCode);

        var playerResponse = await client.PostAsJsonAsync($"/api/teamavailability/team/{team.Id}/players", new AddTeamAvailabilityPlayerRequest(null, "Zaklad Candidate"));
        var player = await playerResponse.Content.ReadFromJsonAsync<TeamAvailabilityPlayerDto>();
        Assert.NotNull(player);

        var memberLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(plainMember.Email, "Player123!#"));
        var memberAuth = await memberLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(memberAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", memberAuth.Token);
        var forbiddenResponse = await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/players/{player!.Id}/zaklad", new UpdateZakladRequest(true));
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenResponse.StatusCode);

        var captainLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(captain.Email, "Player123!#"));
        var captainAuth = await captainLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(captainAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", captainAuth.Token);
        var captainResponse = await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/players/{player.Id}/zaklad", new UpdateZakladRequest(true));
        Assert.Equal(HttpStatusCode.NoContent, captainResponse.StatusCode);
    }

    [Fact]
    public async Task TeamSeason_UpdateRequiresCaptainOrAdmin_AndValidatesDateRange()
    {
        var client = _factory.CreateClient();
        var adminLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);

        var captain = await RegisterTestUserAsync(client);
        var plainMember = await RegisterTestUserAsync(client);

        var createTeamResponse = await client.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Season Permission {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(captain.Id));
        await client.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(plainMember.Id));
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/captain", new AssignTeamCaptainRequest(captain.Id))).StatusCode);

        var memberLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(plainMember.Email, "Player123!#"));
        var memberAuth = await memberLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(memberAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", memberAuth.Token);
        var forbiddenResponse = await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/season", new UpdateTeamSeasonRequest(DateTime.UtcNow, DateTime.UtcNow.AddMonths(6)));
        Assert.Equal(HttpStatusCode.Forbidden, forbiddenResponse.StatusCode);

        var captainLogin = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(captain.Email, "Player123!#"));
        var captainAuth = await captainLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(captainAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", captainAuth.Token);

        var invalidRangeResponse = await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/season", new UpdateTeamSeasonRequest(DateTime.UtcNow.AddMonths(6), DateTime.UtcNow));
        Assert.Equal(HttpStatusCode.BadRequest, invalidRangeResponse.StatusCode);

        var start = DateTime.UtcNow.Date;
        var end = DateTime.UtcNow.AddMonths(6).Date;
        var validResponse = await client.PutAsJsonAsync($"/api/teamavailability/team/{team.Id}/season", new UpdateTeamSeasonRequest(start, end));
        Assert.Equal(HttpStatusCode.NoContent, validResponse.StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth.Token);
        var availability = await client.GetFromJsonAsync<TeamAvailabilityDto>($"/api/teamavailability/team/{team.Id}");
        Assert.Equal(start, availability!.SeasonStartDate);
        Assert.Equal(end, availability.SeasonEndDate);
    }

}

