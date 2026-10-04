using Microsoft.AspNetCore.Antiforgery;

namespace ChessWeb.Middleware;

/// <summary>Cross-origin frontends trusted by both CORS and CSRF checks (configured via Cors:AllowedOrigins).</summary>
public sealed class TrustedOrigins
{
    public TrustedOrigins(IEnumerable<string> origins)
    {
        Origins = new HashSet<string>(origins.Select(Normalize), StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlySet<string> Origins { get; }

    public bool Contains(string origin) => Origins.Contains(Normalize(origin));

    private static string Normalize(string origin) => origin.Trim().TrimEnd('/');
}

/// <summary>
/// Rejects state-changing requests that a browser sent from a foreign site, using Fetch Metadata with an Origin fallback.
/// Authentication uses bearer tokens (not cookies), so this is defense in depth against login CSRF and future cookie use.
/// </summary>
public class CsrfProtectionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<CsrfProtectionMiddleware> _logger;
    private readonly TrustedOrigins _trustedOrigins;
    private readonly IAntiforgery _antiforgery;

    public CsrfProtectionMiddleware(
        RequestDelegate next,
        ILogger<CsrfProtectionMiddleware> logger,
        TrustedOrigins trustedOrigins,
        IAntiforgery antiforgery)
    {
        _next = next;
        _logger = logger;
        _trustedOrigins = trustedOrigins;
        _antiforgery = antiforgery;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (IsSafeMethod(context.Request.Method))
        {
            await _next(context);
            return;
        }

        if (!IsAllowed(context.Request))
        {
            _logger.LogWarning(
                "[CSRF] Blocked cross-site {Method} {Path} (Origin: {Origin}, Sec-Fetch-Site: {FetchSite})",
                SanitizeForLog(context.Request.Method),
                SanitizeForLog(context.Request.Path.ToString()),
                SanitizeForLog(context.Request.Headers.Origin.ToString()),
                SanitizeForLog(context.Request.Headers["Sec-Fetch-Site"].ToString()));
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new { message = "Cross-site request rejected." });
            return;
        }

        if (HasBrowserRequestMetadata(context.Request))
        {
            try
            {
                await _antiforgery.ValidateRequestAsync(context);
            }
            catch (AntiforgeryValidationException)
            {
                _logger.LogWarning("[CSRF] Blocked request without a valid antiforgery token: {Method} {Path}", context.Request.Method, context.Request.Path);
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsJsonAsync(new { message = "A valid CSRF token is required." });
                return;
            }
        }

        await _next(context);
    }

    private static string SanitizeForLog(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        return value
            .Replace("\r", string.Empty)
            .Replace("\n", string.Empty);
    }

    private bool IsAllowed(HttpRequest request)
    {
        var origin = request.Headers.Origin.ToString();
        if (!string.IsNullOrEmpty(origin) && _trustedOrigins.Contains(origin))
        {
            return true;
        }

        var fetchSite = request.Headers["Sec-Fetch-Site"].ToString();
        if (!string.IsNullOrEmpty(fetchSite))
        {
            // The SPA always calls the API same-origin (nginx/Vite proxy); other origins must be allowlisted.
            return fetchSite == "same-origin";
        }

        // Non-browser clients send neither header; browsers without Fetch Metadata still send Origin on unsafe requests.
        return string.IsNullOrEmpty(origin) || IsSameHost(origin, request);
    }

    private static bool IsSameHost(string origin, HttpRequest request) =>
        Uri.TryCreate(origin, UriKind.Absolute, out var originUri) &&
        string.Equals(originUri.Authority, request.Host.Value, StringComparison.OrdinalIgnoreCase);

    private static bool IsSafeMethod(string method) =>
        HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method) || HttpMethods.IsTrace(method);

    private static bool HasBrowserRequestMetadata(HttpRequest request) =>
        !string.IsNullOrEmpty(request.Headers.Origin) ||
        !string.IsNullOrEmpty(request.Headers["Sec-Fetch-Site"]);
}
