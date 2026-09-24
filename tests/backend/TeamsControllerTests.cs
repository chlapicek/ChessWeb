using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class TeamsControllerTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public TeamsControllerTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> CreateAuthenticatedClientAsync(string email, string password)
    {
        var client = _factory.CreateClient();
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
        var auth = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    private static async Task<UserDto> RegisterTestUserAsync(HttpClient client)
    {
        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"test-{Guid.NewGuid():N}@chessweb.local", "Player123!#", $"Test Player {Guid.NewGuid():N}", null, null, null));
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        return auth!.User;
    }

    [Fact]
    public async Task AnonymousUser_CannotAccessTeams()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/teams");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RegisteredUser_CannotAccessTeams()
    {
        var client = await CreateAuthenticatedClientAsync("anna.novakova@chessweb.local", "Player123!#");
        var response = await client.GetAsync("/api/teams");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Admin_CreateTeam_RejectsEmptyOrDuplicateName()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var name = $"Duplicate Check {Guid.NewGuid()}";

        var emptyNameResponse = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest("   "));
        Assert.Equal(HttpStatusCode.Conflict, emptyNameResponse.StatusCode);

        var firstResponse = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest(name));
        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);

        var duplicateResponse = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest(name));
        Assert.Equal(HttpStatusCode.Conflict, duplicateResponse.StatusCode);
    }

    [Fact]
    public async Task AddMember_ReturnsConflict_WhenAlreadyAssigned()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var user = await RegisterTestUserAsync(_factory.CreateClient());

        var createTeamResponse = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Membership Test {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);

        var firstAdd = await admin.PostAsJsonAsync($"/api/teams/{team!.Id}/members", new AssignTeamMemberRequest(user.Id));
        Assert.Equal(HttpStatusCode.OK, firstAdd.StatusCode);

        var duplicateAdd = await admin.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(user.Id));
        Assert.Equal(HttpStatusCode.Conflict, duplicateAdd.StatusCode);
    }

    [Fact]
    public async Task AddMember_ReturnsConflict_WhenMaxTeamsPerUserExceeded()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var user = await RegisterTestUserAsync(_factory.CreateClient());

        for (var i = 0; i < 3; i++)
        {
            var createTeamResponse = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Team Limit {i} {Guid.NewGuid()}"));
            var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
            Assert.NotNull(team);
            var addResponse = await admin.PostAsJsonAsync($"/api/teams/{team!.Id}/members", new AssignTeamMemberRequest(user.Id));
            Assert.Equal(HttpStatusCode.OK, addResponse.StatusCode);
        }

        var fourthTeamResponse = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Team Limit Fourth {Guid.NewGuid()}"));
        var fourthTeam = await fourthTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(fourthTeam);

        var limitedResponse = await admin.PostAsJsonAsync($"/api/teams/{fourthTeam!.Id}/members", new AssignTeamMemberRequest(user.Id));
        Assert.Equal(HttpStatusCode.Conflict, limitedResponse.StatusCode);
    }

    [Fact]
    public async Task AddMember_ReturnsNotFound_ForMissingTeamOrUser()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var user = await RegisterTestUserAsync(_factory.CreateClient());

        var missingTeamResponse = await admin.PostAsJsonAsync($"/api/teams/{Guid.NewGuid()}/members", new AssignTeamMemberRequest(user.Id));
        Assert.Equal(HttpStatusCode.NotFound, missingTeamResponse.StatusCode);

        var createTeamResponse = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Missing User Team {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);
        var missingUserResponse = await admin.PostAsJsonAsync($"/api/teams/{team!.Id}/members", new AssignTeamMemberRequest(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.NotFound, missingUserResponse.StatusCode);
    }

    [Fact]
    public async Task RemoveMember_ReturnsNotFound_WhenNotAMember()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var user = await RegisterTestUserAsync(_factory.CreateClient());

        var createTeamResponse = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Remove Non Member {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);

        var removeResponse = await admin.DeleteAsync($"/api/teams/{team!.Id}/members/{user.Id}");
        Assert.Equal(HttpStatusCode.NotFound, removeResponse.StatusCode);
    }

    [Fact]
    public async Task Admin_CanAssignCaptain_OnlyToCurrentTeamMember()
    {
        var admin = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var captain = await RegisterTestUserAsync(_factory.CreateClient());
        var outsider = await RegisterTestUserAsync(_factory.CreateClient());

        var createTeamResponse = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Captain Team {Guid.NewGuid()}"));
        var team = await createTeamResponse.Content.ReadFromJsonAsync<TeamDto>();
        Assert.NotNull(team);

        var addMemberResponse = await admin.PostAsJsonAsync($"/api/teams/{team!.Id}/members", new AssignTeamMemberRequest(captain.Id));
        Assert.Equal(HttpStatusCode.OK, addMemberResponse.StatusCode);

        var assignResponse = await admin.PutAsJsonAsync($"/api/teams/{team.Id}/captain", new AssignTeamCaptainRequest(captain.Id));
        Assert.Equal(HttpStatusCode.NoContent, assignResponse.StatusCode);

        var invalidAssignResponse = await admin.PutAsJsonAsync($"/api/teams/{team.Id}/captain", new AssignTeamCaptainRequest(outsider.Id));
        Assert.Equal(HttpStatusCode.BadRequest, invalidAssignResponse.StatusCode);
    }
}
