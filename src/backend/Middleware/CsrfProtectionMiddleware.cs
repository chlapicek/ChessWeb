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

    public CsrfProtectionMiddleware(RequestDelegate next, ILogger<CsrfProtectionMiddleware> logger, TrustedOrigins trustedOrigins)
    {
        _next = next;
        _logger = logger;
        _trustedOrigins = trustedOrigins;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (IsSafeMethod(context.Request.Method) || IsAllowed(context.Request))
        {
            await _next(context);
            return;
        }

        _logger.LogWarning(
            "[CSRF] Blocked cross-site {Method} {Path} (Origin: {Origin}, Sec-Fetch-Site: {FetchSite})",
            context.Request.Method,
            context.Request.Path,
            context.Request.Headers.Origin.ToString(),
            context.Request.Headers["Sec-Fetch-Site"].ToString());
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new { message = "Cross-site request rejected." });
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
}
