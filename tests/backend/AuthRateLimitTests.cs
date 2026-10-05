using System.Net;
using System.Net.Http.Json;
using ChessWeb.Services;
using Microsoft.AspNetCore.Http;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class AuthRateLimitTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public AuthRateLimitTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    [Fact]
    public void GetPartitionKey_GroupsIpv6AddressesBySubnet()
    {
        var firstContext = new DefaultHttpContext();
        firstContext.Connection.RemoteIpAddress = IPAddress.Parse("2001:db8::1");
        var secondContext = new DefaultHttpContext();
        secondContext.Connection.RemoteIpAddress = IPAddress.Parse("2001:db8::2");

        Assert.Equal(AuthRateLimit.GetPartitionKey(firstContext), AuthRateLimit.GetPartitionKey(secondContext));
    }

    [Fact]
    public async Task Login_ReturnsTooManyRequestsAfterConfiguredLimit()
    {
        var limitedFactory = _factory.WithWebHostBuilder(builder =>
            builder.UseSetting("AuthRateLimit:LoginPermitsPerMinute", "2"));
        var client = limitedFactory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await PostLoginAsync(client)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await PostLoginAsync(client)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await PostLoginAsync(client)).StatusCode);
    }

    [Fact]
    public async Task Registration_ReturnsTooManyRequestsAfterConfiguredLimit()
    {
        var limitedFactory = _factory.WithWebHostBuilder(builder =>
            builder.UseSetting("AuthRateLimit:RegistrationPermitsPerMinute", "2"));
        var client = limitedFactory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await PostRegistrationAsync(client)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await PostRegistrationAsync(client)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await PostRegistrationAsync(client)).StatusCode);
    }

    private static Task<HttpResponseMessage> PostLoginAsync(HttpClient client) =>
        client.PostAsJsonAsync("/api/auth/login", new LoginRequest($"missing-{Guid.NewGuid():N}@chessweb.local", "invalid-password"));

    private static Task<HttpResponseMessage> PostRegistrationAsync(HttpClient client) =>
        client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(
            $"rate-limit-{Guid.NewGuid():N}@chessweb.local", "thisisalongpassword", "Rate Limit User", null, null, null));
}