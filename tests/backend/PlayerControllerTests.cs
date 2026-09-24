using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ChessWeb.Domain.Entities;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class PlayerControllerTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public PlayerControllerTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private static async Task<(HttpClient client, UserDto user)> RegisterAndAuthenticateAsync(
        HttpClient client, string? nickname = null)
    {
        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"test-{Guid.NewGuid():N}@chessweb.local", "Player123!#", $"Test Player {Guid.NewGuid():N}", null, null, nickname));
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return (client, auth.User);
    }

    [Fact]
    public async Task Register_WithNickname_SucceedsAndReturnsNickname()
    {
        var client = _factory.CreateClient();
        var nickname = $"nick-{Guid.NewGuid():N}";
        var (_, user) = await RegisterAndAuthenticateAsync(client, nickname);

        Assert.Equal(nickname, user.Nickname);
    }

    [Fact]
    public async Task Register_WithDuplicateNickname_ReturnsConflict()
    {
        var client = _factory.CreateClient();
        var nickname = $"nick-{Guid.NewGuid():N}";
        await RegisterAndAuthenticateAsync(client, nickname);

        var anotherClient = _factory.CreateClient();
        var conflictResponse = await anotherClient.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"test-{Guid.NewGuid():N}@chessweb.local", "Player123!#", "Someone Else", null, null, nickname.ToUpperInvariant()));

        Assert.Equal(HttpStatusCode.Conflict, conflictResponse.StatusCode);
    }

    [Fact]
    public async Task Login_WithEmail_StillWorks()
    {
        var client = _factory.CreateClient();
        var (_, user) = await RegisterAndAuthenticateAsync(client);

        var loginClient = _factory.CreateClient();
        var loginResponse = await loginClient.PostAsJsonAsync("/api/auth/login", new LoginRequest(user.Email, "Player123!#"));

        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
    }

    [Fact]
    public async Task Login_WithNickname_Works()
    {
        var client = _factory.CreateClient();
        var nickname = $"nick-{Guid.NewGuid():N}";
        await RegisterAndAuthenticateAsync(client, nickname);

        var loginClient = _factory.CreateClient();
        var loginResponse = await loginClient.PostAsJsonAsync("/api/auth/login", new LoginRequest(nickname, "Player123!#"));

        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
        var auth = await loginResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        Assert.Equal(nickname, auth!.User.Nickname);
    }

    [Fact]
    public async Task GetPlayers_RequiresAuthentication()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/player");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task GetPlayers_ReturnsSummariesForAuthenticatedUser()
    {
        var client = _factory.CreateClient();
        await RegisterAndAuthenticateAsync(client);

        var players = await client.GetFromJsonAsync<List<PlayerSummaryDto>>("/api/player");

        Assert.NotNull(players);
        Assert.NotEmpty(players!);
    }

    [Fact]
    public async Task GetPlayer_ReturnsProfileWithIsSelfTrue_ForOwnId()
    {
        var client = _factory.CreateClient();
        var (_, user) = await RegisterAndAuthenticateAsync(client);

        var profile = await client.GetFromJsonAsync<PlayerProfileDto>($"/api/player/{user.Id}");

        Assert.NotNull(profile);
        Assert.True(profile!.IsSelf);
        Assert.Equal(user.FullName, profile.FullName);
    }

    [Fact]
    public async Task GetPlayer_ReturnsNotFound_ForUnknownId()
    {
        var client = _factory.CreateClient();
        await RegisterAndAuthenticateAsync(client);

        var response = await client.GetAsync($"/api/player/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task UpdateMyNickname_UpdatesNicknameForSelf()
    {
        var client = _factory.CreateClient();
        await RegisterAndAuthenticateAsync(client);
        var newNickname = $"newnick-{Guid.NewGuid():N}";

        var response = await client.PutAsJsonAsync("/api/player/me/nickname", new UpdateNicknameRequest(newNickname));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.Content.ReadFromJsonAsync<UserDto>();
        Assert.NotNull(updated);
        Assert.Equal(newNickname, updated!.Nickname);
    }

    [Fact]
    public async Task UpdateMyNickname_ReturnsConflict_ForTakenNickname()
    {
        var takenNickname = $"taken-{Guid.NewGuid():N}";
        var firstClient = _factory.CreateClient();
        await RegisterAndAuthenticateAsync(firstClient, takenNickname);

        var secondClient = _factory.CreateClient();
        await RegisterAndAuthenticateAsync(secondClient);

        var response = await secondClient.PutAsJsonAsync("/api/player/me/nickname", new UpdateNicknameRequest(takenNickname));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task SubscribeAndUnsubscribe_ToCalendarEvent_IsIdempotentAndReflectedInMySubscriptions()
    {
        var adminClient = _factory.CreateClient();
        var adminLogin = await adminClient.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth!.Token);

        var createEventResponse = await adminClient.PostAsJsonAsync("/api/calendar/events", new CreateCalendarEventRequest(
            $"Subscription Test Event {Guid.NewGuid()}", "Description", "Location",
            DateTime.UtcNow.AddDays(5), DateTime.UtcNow.AddDays(5).AddHours(2), false, CalendarEventCategory.Tournament));
        var createdEvents = await createEventResponse.Content.ReadFromJsonAsync<List<CalendarEvent>>();
        Assert.NotNull(createdEvents);
        var eventId = createdEvents!.Single().Id;

        var client = _factory.CreateClient();
        await RegisterAndAuthenticateAsync(client);

        // Subscribing twice should be idempotent.
        var subscribeResponse1 = await client.PostAsync($"/api/calendar/events/{eventId}/subscribe", null);
        Assert.Equal(HttpStatusCode.OK, subscribeResponse1.StatusCode);
        var subscribeResponse2 = await client.PostAsync($"/api/calendar/events/{eventId}/subscribe", null);
        Assert.Equal(HttpStatusCode.OK, subscribeResponse2.StatusCode);

        var mySubscriptions = await client.GetFromJsonAsync<List<CalendarEvent>>("/api/calendar/my-subscriptions");
        Assert.NotNull(mySubscriptions);
        Assert.Contains(mySubscriptions!, e => e.Id == eventId);

        // Unsubscribing twice should also be idempotent.
        var unsubscribeResponse1 = await client.DeleteAsync($"/api/calendar/events/{eventId}/subscribe");
        Assert.Equal(HttpStatusCode.NoContent, unsubscribeResponse1.StatusCode);
        var unsubscribeResponse2 = await client.DeleteAsync($"/api/calendar/events/{eventId}/subscribe");
        Assert.Equal(HttpStatusCode.NoContent, unsubscribeResponse2.StatusCode);

        var mySubscriptionsAfter = await client.GetFromJsonAsync<List<CalendarEvent>>("/api/calendar/my-subscriptions");
        Assert.NotNull(mySubscriptionsAfter);
        Assert.DoesNotContain(mySubscriptionsAfter!, e => e.Id == eventId);
    }

    [Fact]
    public async Task Subscribe_ReturnsNotFound_ForUnknownEvent()
    {
        var client = _factory.CreateClient();
        await RegisterAndAuthenticateAsync(client);

        var response = await client.PostAsync($"/api/calendar/events/{Guid.NewGuid()}/subscribe", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task SubscribeAndUnsubscribe_ToCalendarSeries_IsIdempotentForAllOccurrences()
    {
        var adminClient = _factory.CreateClient();
        var adminLogin = await adminClient.PostAsJsonAsync("/api/auth/login", new LoginRequest("admin@chessweb.local", "Admin123!#"));
        var adminAuth = await adminLogin.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(adminAuth);
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth!.Token);

        var createEventResponse = await adminClient.PostAsJsonAsync("/api/calendar/events", new CreateCalendarEventRequest(
            $"Subscription Test Series {Guid.NewGuid()}", "Description", "Location",
            DateTime.UtcNow.AddDays(5), DateTime.UtcNow.AddDays(5).AddHours(2), false,
            CalendarEventCategory.Tournament, RecurrenceType.Weekly, 3));
        var createdEvents = await createEventResponse.Content.ReadFromJsonAsync<List<CalendarEvent>>();
        Assert.NotNull(createdEvents);
        Assert.Equal(3, createdEvents!.Count);
        var seriesId = createdEvents[0].RecurrenceGroupId;
        Assert.NotNull(seriesId);

        var client = _factory.CreateClient();
        await RegisterAndAuthenticateAsync(client);

        var subscribeResponse1 = await client.PostAsync($"/api/calendar/events/series/{seriesId}/subscribe", null);
        Assert.Equal(HttpStatusCode.OK, subscribeResponse1.StatusCode);
        var subscribeResponse2 = await client.PostAsync($"/api/calendar/events/series/{seriesId}/subscribe", null);
        Assert.Equal(HttpStatusCode.OK, subscribeResponse2.StatusCode);

        var mySubscriptions = await client.GetFromJsonAsync<List<CalendarEvent>>("/api/calendar/my-subscriptions");
        Assert.NotNull(mySubscriptions);
        Assert.Equal(createdEvents.Count, createdEvents.Count(eventItem => mySubscriptions!.Any(subscription => subscription.Id == eventItem.Id)));

        var unsubscribeResponse1 = await client.DeleteAsync($"/api/calendar/events/series/{seriesId}/subscribe");
        Assert.Equal(HttpStatusCode.NoContent, unsubscribeResponse1.StatusCode);
        var unsubscribeResponse2 = await client.DeleteAsync($"/api/calendar/events/series/{seriesId}/subscribe");
        Assert.Equal(HttpStatusCode.NoContent, unsubscribeResponse2.StatusCode);

        var mySubscriptionsAfter = await client.GetFromJsonAsync<List<CalendarEvent>>("/api/calendar/my-subscriptions");
        Assert.NotNull(mySubscriptionsAfter);
        Assert.DoesNotContain(mySubscriptionsAfter!, eventItem => createdEvents.Any(createdEvent => createdEvent.Id == eventItem.Id));
    }
}
