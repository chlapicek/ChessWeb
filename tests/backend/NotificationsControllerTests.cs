using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ChessWeb.DTOs;
using ChessWeb.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class NotificationsControllerTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public NotificationsControllerTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> LoginAsync(string email, string password)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return client;
    }

    private async Task<(HttpClient Client, UserDto User)> RegisterAsync()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"notifications-{Guid.NewGuid():N}@chessweb.local", "Player123!#", $"Notification User {Guid.NewGuid():N}", null, null, null));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);
        return (client, auth.User);
    }

    private async Task<TeamDto> CreateTeamAsync(HttpClient admin)
    {
        var response = await admin.PostAsJsonAsync("/api/teams", new CreateTeamRequest($"Notifications {Guid.NewGuid():N}"));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TeamDto>())!;
    }

    [Fact]
    public async Task Inbox_RequiresAuthentication_AndIsScopedToAuthenticatedUser()
    {
        var anonymous = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/notifications")).StatusCode);

        var admin = await LoginAsync("admin@chessweb.local", "Admin123!#");
        var (recipient, recipientUser) = await RegisterAsync();
        var (other, _) = await RegisterAsync();
        var team = await CreateTeamAsync(admin);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(recipientUser.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/teams/{team.Id}/captain", new AssignTeamCaptainRequest(recipientUser.Id))).StatusCode);

        var send = await recipient.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Team update", "A message", null, "team", [team.Id], null, null));
        Assert.Equal(HttpStatusCode.OK, send.StatusCode);
        var sent = await send.Content.ReadFromJsonAsync<NotificationSendResult>();
        Assert.NotNull(sent);
        Assert.Equal(1, sent!.RecipientCount);

        var ownInbox = await recipient.GetFromJsonAsync<NotificationInboxDto>("/api/notifications");
        Assert.NotNull(ownInbox);
        Assert.Single(ownInbox!.Items);
        Assert.Equal("A message", ownInbox.Items[0].Message);
        Assert.Empty(await other.GetFromJsonAsync<NotificationInboxDto>("/api/notifications") is { } otherInbox ? otherInbox.Items : []);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsync($"/api/notifications/{sent.Id}/read", null)).StatusCode);
    }

    [Fact]
    public async Task Captain_CanOnlySendToCurrentTeamAndAdminMixedAudienceIsDeduplicatedAndSnapshotted()
    {
        var admin = await LoginAsync("admin@chessweb.local", "Admin123!#");
        var (captain, captainUser) = await RegisterAsync();
        var (recipient, recipientUser) = await RegisterAsync();
        var team = await CreateTeamAsync(admin);
        var otherTeam = await CreateTeamAsync(admin);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(captainUser.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/teams/{team.Id}/captain", new AssignTeamCaptainRequest(captainUser.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(recipientUser.Id))).StatusCode);

        var captainOptions = await captain.GetFromJsonAsync<NotificationAudienceOptionsDto>("/api/notifications/audience-options");
        Assert.NotNull(captainOptions);
        Assert.Contains(captainOptions!.Teams, option => option.Id == team.Id);
        Assert.Empty(captainOptions.Users);
        Assert.Equal(HttpStatusCode.Forbidden, (await captain.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Out of scope", "No", null, "team", [otherTeam.Id], null, null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await captain.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Admin only", "No", null, "admin", null, [recipientUser.Id], null))).StatusCode);

        var changeRoles = await admin.PostAsJsonAsync("/api/auth/change-roles", new ChangeRoleRequest(recipientUser.Id, ["RegisteredUser", "ClubMember"]));
        Assert.Equal(HttpStatusCode.OK, changeRoles.StatusCode);
        var currentUsers = await admin.GetFromJsonAsync<List<UserDto>>("/api/auth/users") ?? throw new InvalidOperationException("The user list was empty.");
        var currentTeam = (await admin.GetFromJsonAsync<List<TeamDto>>("/api/teams"))!.Single(row => row.Id == team.Id);
        var expectedRecipients = currentUsers.Where(user => user.Roles.Contains("ClubMember")).Select(user => user.Id).ToHashSet();
        expectedRecipients.UnionWith(currentUsers.Where(user => currentTeam.UserIds.Contains(user.Id) && user.Roles.Contains("RegisteredUser")).Select(user => user.Id));
        expectedRecipients.Add(recipientUser.Id);
        var mixedSend = await admin.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Club notice", "Snapshot text", null, "admin", [team.Id], [recipientUser.Id], ["ClubMember"]));
        Assert.Equal(HttpStatusCode.OK, mixedSend.StatusCode);
        var result = await mixedSend.Content.ReadFromJsonAsync<NotificationSendResult>();
        Assert.NotNull(result);
        Assert.Equal(expectedRecipients.Count, result!.RecipientCount);

        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/teams/{team.Id}/members/{recipientUser.Id}")).StatusCode);
        var inboxAfterRemoval = await recipient.GetFromJsonAsync<NotificationInboxDto>("/api/notifications");
        Assert.NotNull(inboxAfterRemoval);
        var snapshot = Assert.Single(inboxAfterRemoval!.Items);
        Assert.Equal("Snapshot text", snapshot.Message);
    }

    [Fact]
    public async Task ReadState_IsIdempotentAndPaginationIsCapped()
    {
        var admin = await LoginAsync("admin@chessweb.local", "Admin123!#");
        var (recipient, recipientUser) = await RegisterAsync();
        var team = await CreateTeamAsync(admin);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(recipientUser.Id))).StatusCode);
        var send = await admin.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Read test", "Body", null, "admin", null, [recipientUser.Id], null));
        Assert.Equal(HttpStatusCode.OK, send.StatusCode);
        var result = (await send.Content.ReadFromJsonAsync<NotificationSendResult>())!;

        var count = await recipient.GetFromJsonAsync<UnreadCountResponse>("/api/notifications/unread-count");
        Assert.Equal(1, count!.Count);
        var cappedPage = await recipient.GetFromJsonAsync<NotificationInboxDto>("/api/notifications?pageSize=500");
        Assert.Equal(50, cappedPage!.PageSize);
        Assert.Equal(HttpStatusCode.NoContent, (await recipient.PutAsync($"/api/notifications/{result.Id}/read", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await recipient.PutAsync($"/api/notifications/{result.Id}/read", null)).StatusCode);
        count = await recipient.GetFromJsonAsync<UnreadCountResponse>("/api/notifications/unread-count");
        Assert.Equal(0, count!.Count);
        var unread = await recipient.GetFromJsonAsync<NotificationInboxDto>("/api/notifications?unreadOnly=true");
        Assert.Empty(unread!.Items);
    }

    [Theory]
    [InlineData("https://example.com")]
    [InlineData("//example.com/path")]
    [InlineData("/\\\\example.com/path")]
    public async Task Send_RejectsUnsafeInternalLinks(string link)
    {
        var admin = await LoginAsync("admin@chessweb.local", "Admin123!#");
        var (recipient, recipientUser) = await RegisterAsync();
        var response = await admin.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Link", "Body", link, "admin", null, [recipientUser.Id], null));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Send_AllowsSafeAppRelativeLinks()
    {
        var admin = await LoginAsync("admin@chessweb.local", "Admin123!#");
        var (recipient, recipientUser) = await RegisterAsync();
        var response = await admin.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Calendar", "Open the schedule.", "/calendar?view=month", "admin", null, [recipientUser.Id], null));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var inbox = await recipient.GetFromJsonAsync<NotificationInboxDto>("/api/notifications");
        Assert.Equal("/calendar?view=month", Assert.Single(inbox!.Items).InternalLink);
    }

    [Fact]
    public async Task Send_RejectsUnknownTargetsAndOversizedContent()
    {
        var admin = await LoginAsync("admin@chessweb.local", "Admin123!#");
        var unknown = await admin.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Target", "Body", null, "admin", null, [Guid.NewGuid()], null));
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        var empty = await admin.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Target", "Body", null, "admin", null, null, null));
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
        var oversized = await admin.PostAsJsonAsync("/api/notifications", new SendNotificationRequest(new string('x', 121), "Body", null, "admin", null, [Guid.NewGuid()], null));
        Assert.Equal(HttpStatusCode.BadRequest, oversized.StatusCode);
        var oversizedMessage = await admin.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Title", new string('x', 4001), null, "admin", null, [Guid.NewGuid()], null));
        Assert.Equal(HttpStatusCode.BadRequest, oversizedMessage.StatusCode);
        var paddedMessage = await admin.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Title", new string(' ', 4000) + "Body", null, "admin", null, [Guid.NewGuid()], null));
        Assert.Equal(HttpStatusCode.BadRequest, paddedMessage.StatusCode);
    }

    [Fact]
    public async Task Send_BoundsSenderNameToColumnLimit()
    {
        var admin = await LoginAsync("admin@chessweb.local", "Admin123!#");
        var senderClient = _factory.CreateClient();
        var registerResponse = await senderClient.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"long-name-{Guid.NewGuid():N}@chessweb.local", "Player123!#", new string('N', 201), null, null, null));
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);
        var auth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(auth);
        senderClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);

        var team = await CreateTeamAsync(admin);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/teams/{team.Id}/members", new AssignTeamMemberRequest(auth.User.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync($"/api/teams/{team.Id}/captain", new AssignTeamCaptainRequest(auth.User.Id))).StatusCode);

        var response = await senderClient.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("Title", "Body", null, "team", [team.Id], null, null));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var inbox = await senderClient.GetFromJsonAsync<NotificationInboxDto>("/api/notifications");
        Assert.Equal(NotificationService.MaxSenderNameLength, Assert.Single(inbox!.Items).SenderName.Length);
    }

    [Fact]
    public async Task SuperAdminCanSendToSelectedAccountsAndSeesClubMemberAudienceRole()
    {
        var superAdmin = await LoginAsync("superadmin@chessweb.local", "SuperAdmin123!#");
        var (_, recipient) = await RegisterAsync();
        var options = await superAdmin.GetFromJsonAsync<NotificationAudienceOptionsDto>("/api/notifications/audience-options");
        Assert.NotNull(options);
        Assert.True(options!.IsAdministrator);
        Assert.Contains("ClubMember", options.Roles);

        var response = await superAdmin.PostAsJsonAsync("/api/notifications", new SendNotificationRequest("System notice", "Targeted by SuperAdmin", null, "admin", null, [recipient.Id], null));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.Content.ReadFromJsonAsync<NotificationSendResult>();
        Assert.Equal(1, result!.RecipientCount);
    }

    private record UnreadCountResponse(int Count);
}
