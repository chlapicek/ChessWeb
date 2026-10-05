using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ChessWeb.Domain.Entities;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace ChessWeb.Services;

public interface IJwtService
{
    GeneratedJwt GenerateToken(ApplicationUser user, IEnumerable<string> roles);
    ClaimsPrincipal? GetPrincipalFromToken(string token);
}

public sealed record GeneratedJwt(string Token, DateTime ExpiresAt);

public class JwtService : IJwtService
{
    public const int MinimumSigningKeyBytes = 32;
    public const int MinimumTokenLifetimeMinutes = 60;
    public const int DefaultTokenLifetimeMinutes = 60;
    public const int MaximumTokenLifetimeMinutes = 120;
    public static readonly TimeSpan TokenClockSkew = TimeSpan.FromSeconds(30);

    private readonly IConfiguration _config;

    public JwtService(IConfiguration config)
    {
        _config = config;
    }

    public static byte[] GetSigningKeyBytes(string? configuredKey)
    {
        if (string.IsNullOrWhiteSpace(configuredKey))
        {
            throw new InvalidOperationException("Jwt:Key configuration is required.");
        }

        var keyBytes = Encoding.UTF8.GetBytes(configuredKey);
        if (keyBytes.Length < MinimumSigningKeyBytes)
        {
            throw new InvalidOperationException($"Jwt:Key must be at least {MinimumSigningKeyBytes} UTF-8 bytes.");
        }

        return keyBytes;
    }

    public static int GetTokenLifetimeMinutes(string? configuredValue)
    {
        if (string.IsNullOrWhiteSpace(configuredValue))
        {
            return DefaultTokenLifetimeMinutes;
        }

        if (!int.TryParse(configuredValue, out var minutes) || minutes < MinimumTokenLifetimeMinutes || minutes > MaximumTokenLifetimeMinutes)
        {
            throw new InvalidOperationException($"Jwt:DurationInMinutes must be between {MinimumTokenLifetimeMinutes} and {MaximumTokenLifetimeMinutes}.");
        }

        return minutes;
    }

    public GeneratedJwt GenerateToken(ApplicationUser user, IEnumerable<string> roles)
    {
        var keyBytes = GetSigningKeyBytes(_config["Jwt:Key"]);
        var issuer = _config["Jwt:Issuer"] ?? "ChessWebAPI";
        var audience = _config["Jwt:Audience"] ?? "ChessWebClient";
        var key = new SymmetricSecurityKey(keyBytes);
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.UserName ?? user.Email ?? string.Empty),
            new(ClaimTypes.Email, user.Email ?? string.Empty),
            new("fullName", user.FullName),
            new("nickname", user.Nickname ?? string.Empty)
        };

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var expiresAt = DateTimeOffset.FromUnixTimeSeconds(
            DateTimeOffset.UtcNow.AddMinutes(GetTokenLifetimeMinutes(_config["Jwt:DurationInMinutes"])).ToUnixTimeSeconds()).UtcDateTime;

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: expiresAt,
            signingCredentials: creds
        );

        return new GeneratedJwt(new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }

    public ClaimsPrincipal? GetPrincipalFromToken(string token)
    {
        var tokenValidationParameters = new TokenValidationParameters
        {
            ValidateAudience = false,
            ValidateIssuer = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(GetSigningKeyBytes(_config["Jwt:Key"])),
            ValidateLifetime = false // Here we just want to inspect claims
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        try
        {
            var principal = tokenHandler.ValidateToken(token, tokenValidationParameters, out var securityToken);
            if (securityToken is not JwtSecurityToken jwtSecurityToken ||
                !jwtSecurityToken.Header.Alg.Equals(SecurityAlgorithms.HmacSha256, StringComparison.InvariantCultureIgnoreCase))
            {
                return null;
            }
            return principal;
        }
        catch
        {
            return null;
        }
    }
}
