using System.Net;
using System.Net.Http.Json;
using ChessWeb.DTOs;
using ChessWeb.Middleware;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace ChessWeb.Tests.Integration;

public class SecurityHeadersTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public SecurityHeadersTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private static LoginRequest InvalidLogin() => new($"nobody-{Guid.NewGuid():N}@chessweb.local", "wrong-password");

    private async Task<HttpResponseMessage> PostLoginAsync(params (string Name, string Value)[] headers) =>
        await SendLoginAsync(HttpMethod.Post, headers);

    private async Task<HttpResponseMessage> SendLoginAsync(HttpMethod method, params (string Name, string Value)[] headers)
    {
        var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(method, "/api/auth/login") { Content = JsonContent.Create(InvalidLogin()) };
        foreach (var (name, value) in headers) request.Headers.TryAddWithoutValidation(name, value);
        return await client.SendAsync(request);
    }

    [Theory]
    [InlineData("/api/articles")]
    [InlineData("/api/does-not-exist")]
    public async Task Responses_IncludeHardeningHeaders(string path)
    {
        var response = await _factory.CreateClient().GetAsync(path);

        Assert.Equal(SecurityHeadersMiddleware.ContentSecurityPolicy, response.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", response.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-referrer", response.Headers.GetValues("Referrer-Policy").Single());
        Assert.Equal("same-origin", response.Headers.GetValues("Cross-Origin-Resource-Policy").Single());
        Assert.Equal("same-origin", response.Headers.GetValues("Cross-Origin-Opener-Policy").Single());
        Assert.Equal(SecurityHeadersMiddleware.PermissionsPolicy, response.Headers.GetValues("Permissions-Policy").Single());
        Assert.False(response.Headers.Contains("Server"));
    }

    [Theory]
    [InlineData("cross-site", "https://evil.example")]
    [InlineData("same-site", "https://sibling.localhost")]
    [InlineData("none", null)]
    [InlineData("cross-site", "null")]
    public async Task UntrustedUnsafeRequest_IsRejected(string fetchSite, string? origin)
    {
        var headers = new List<(string, string)> { ("Sec-Fetch-Site", fetchSite) };
        if (origin != null) headers.Add(("Origin", origin));

        var response = await PostLoginAsync(headers.ToArray());

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
    }

    [Theory]
    [InlineData("PUT")]
    [InlineData("PATCH")]
    [InlineData("DELETE")]
    public async Task CrossSiteRequest_IsRejectedForEveryUnsafeMethod(string method)
    {
        var response = await SendLoginAsync(new HttpMethod(method), ("Origin", "https://evil.example"), ("Sec-Fetch-Site", "cross-site"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("null")]
    public async Task ForeignOriginWithoutFetchMetadata_IsRejected(string origin)
    {
        var response = await PostLoginAsync(("Origin", origin));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("same-origin", null)]
    [InlineData("cross-site", "http://localhost:3000")]
    [InlineData("cross-site", "HTTP://LOCALHOST:3000/")]
    [InlineData(null, "http://localhost")]
    [InlineData(null, null)]
    public async Task TrustedUnsafeRequest_ReachesTheApplication(string? fetchSite, string? origin)
    {
        var headers = new List<(string, string)>();
        if (fetchSite != null) headers.Add(("Sec-Fetch-Site", fetchSite));
        if (origin != null) headers.Add(("Origin", origin));

        var response = await PostLoginAsync(headers.ToArray());

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CrossSiteSafeRequest_IsAllowed()
    {
        var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/articles");
        request.Headers.TryAddWithoutValidation("Origin", "https://evil.example");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "cross-site");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
