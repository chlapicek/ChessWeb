using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ChessWeb.Domain.Entities;
using ChessWeb.Services;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ChessWeb.Tests.Services;

public class JwtServiceTests
{
    private readonly JwtService _service;

    public JwtServiceTests()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "test-signing-key-that-is-only-for-tests-1234567890",
                ["Jwt:Issuer"] = "ChessWebAPI",
                ["Jwt:Audience"] = "ChessWebClient",
                ["Jwt:DurationInMinutes"] = "60"
            })
            .Build();

        _service = new JwtService(config);
    }

    [Fact]
    public void GenerateToken_CreatesToken_WithExpectedClaims()
    {
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "player1",
            Email = "player1@example.com",
            FullName = "Player One"
        };

        var generated = _service.GenerateToken(user, new[] { "RootPlayer", "Admin" });

        Assert.False(string.IsNullOrWhiteSpace(generated.Token));

        var principal = _service.GetPrincipalFromToken(generated.Token);
        Assert.NotNull(principal);
        Assert.Equal(user.Id.ToString(), principal!.FindFirstValue(ClaimTypes.NameIdentifier));
        Assert.Equal(user.UserName, principal.FindFirstValue(ClaimTypes.Name));
        Assert.Equal(user.Email, principal.FindFirstValue(ClaimTypes.Email));
        Assert.Equal(user.FullName, principal.FindFirstValue("fullName"));
        Assert.Contains(principal.FindAll(ClaimTypes.Role), c => c.Value == "RootPlayer");
        Assert.Contains(principal.FindAll(ClaimTypes.Role), c => c.Value == "Admin");
    }

    [Fact]
    public void GetPrincipalFromToken_WithInvalidToken_ReturnsNull()
    {
        var principal = _service.GetPrincipalFromToken("not-a-valid-token");

        Assert.Null(principal);
    }

    [Fact]
    public void GenerateToken_UsesConfiguredLifetime()
    {
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = "player2",
            Email = "player2@example.com",
            FullName = "Player Two"
        };

        var generated = _service.GenerateToken(user, new[] { "HostingPlayer" });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(generated.Token);

        Assert.NotNull(jwt);
        Assert.Equal(generated.ExpiresAt, jwt.ValidTo);
        Assert.True(jwt.ValidTo > DateTime.UtcNow.AddMinutes(59));
    }

    [Fact]
    public void GetSigningKeyBytes_RejectsShortKeys()
    {
        Assert.Throws<InvalidOperationException>(() => JwtService.GetSigningKeyBytes("short-key"));
    }

    [Fact]
    public void GetTokenLifetimeMinutes_RejectsValuesOutsideTheSupportedRange()
    {
        Assert.Throws<InvalidOperationException>(() => JwtService.GetTokenLifetimeMinutes("1440"));
        Assert.Equal(JwtService.DefaultTokenLifetimeMinutes, JwtService.GetTokenLifetimeMinutes(null));
    }

    [Fact]
    public void TokenClockSkew_IsBounded()
    {
        Assert.Equal(TimeSpan.FromSeconds(30), JwtService.TokenClockSkew);
    }
}
