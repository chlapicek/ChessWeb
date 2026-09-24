using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using ChessWeb.Data;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class LoggingControllerTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public LoggingControllerTests(WebApplicationFactory<Program> factory)
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

    [Fact]
    public async Task Admin_GetSettings_ReturnsForbidden()
    {
        var client = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var response = await client.GetAsync("/api/logging/settings");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Admin_PutSettings_ReturnsForbidden()
    {
        var client = await CreateAuthenticatedClientAsync("admin@chessweb.local", "Admin123!#");
        var response = await client.PutAsJsonAsync("/api/logging/settings", new UpdateLoggingSettingsRequest("Debug", 10));
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task RegisteredUser_CannotAccessSettings()
    {
        var client = _factory.CreateClient();
        var registerResponse = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"logging-test-{Guid.NewGuid():N}@chessweb.local", "Player123!#", "Logging Test User", null, null, null));
        var registerAuth = await registerResponse.Content.ReadFromJsonAsync<AuthResponse>();
        Assert.NotNull(registerAuth);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", registerAuth!.Token);

        var response = await client.GetAsync("/api/logging/settings");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task SuperAdmin_CanReadDefaultSettings()
    {
        var client = await CreateAuthenticatedClientAsync("superadmin@chessweb.local", "SuperAdmin123!#");
        var response = await client.GetAsync("/api/logging/settings");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var settings = await response.Content.ReadFromJsonAsync<LoggingSettingsDto>();
        Assert.NotNull(settings);
        Assert.False(string.IsNullOrWhiteSpace(settings!.MinimumLevel));
        Assert.InRange(settings.RetainedFileCountLimit, 1, 365);
    }

    [Fact]
    public async Task SuperAdmin_CanUpdateSettings()
    {
        var client = await CreateAuthenticatedClientAsync("superadmin@chessweb.local", "SuperAdmin123!#");

        var response = await client.PutAsJsonAsync("/api/logging/settings", new UpdateLoggingSettingsRequest("Warning", 21));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.Content.ReadFromJsonAsync<LoggingSettingsDto>();
        Assert.NotNull(updated);
        Assert.Equal("Warning", updated!.MinimumLevel);
        Assert.Equal(21, updated.RetainedFileCountLimit);

        var getResponse = await client.GetAsync("/api/logging/settings");
        var reread = await getResponse.Content.ReadFromJsonAsync<LoggingSettingsDto>();
        Assert.Equal("Warning", reread!.MinimumLevel);
        Assert.Equal(21, reread.RetainedFileCountLimit);

        // Restore defaults so other tests observe a predictable starting state.
        await client.PutAsJsonAsync("/api/logging/settings", new UpdateLoggingSettingsRequest("Information", 14));
    }

    [Fact]
    public async Task SuperAdmin_UpdateSettings_RejectsInvalidMinimumLevel()
    {
        var client = await CreateAuthenticatedClientAsync("superadmin@chessweb.local", "SuperAdmin123!#");
        var response = await client.PutAsJsonAsync("/api/logging/settings", new UpdateLoggingSettingsRequest("NotALevel", 14));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(366)]
    public async Task SuperAdmin_UpdateSettings_RejectsOutOfRangeRetainedFileCount(int retainedFileCountLimit)
    {
        var client = await CreateAuthenticatedClientAsync("superadmin@chessweb.local", "SuperAdmin123!#");
        var response = await client.PutAsJsonAsync("/api/logging/settings", new UpdateLoggingSettingsRequest("Information", retainedFileCountLimit));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task LoggingSettings_SingleRowIsSeededExactlyOnce_AcrossMultipleAppStartups()
    {
        using var secondFactory = new WebApplicationFactory<Program>();
        using var thirdFactory = new WebApplicationFactory<Program>();

        // Force each factory (and the shared one) to construct its host/services, re-running DbInitializer.SeedAsync.
        _ = _factory.Services;
        _ = secondFactory.Services;
        _ = thirdFactory.Services;

        using var scope = thirdFactory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var count = await context.LoggingSettings.CountAsync();
        Assert.Equal(1, count);
    }
}
