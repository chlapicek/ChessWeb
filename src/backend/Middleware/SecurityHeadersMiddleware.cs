namespace ChessWeb.Middleware;

/// <summary>Adds hardening headers to every API response, including errors and file downloads.</summary>
public class SecurityHeadersMiddleware
{
    // The API only serves JSON and attachment downloads, so nothing it returns may run scripts, load resources or be framed.
    public const string ContentSecurityPolicy = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox";
    // Keep in sync with src/frontend/security-headers.conf.
    public const string PermissionsPolicy = "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()";

    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers.ContentSecurityPolicy = ContentSecurityPolicy;
            headers.XContentTypeOptions = "nosniff";
            headers.XFrameOptions = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            headers["Cross-Origin-Opener-Policy"] = "same-origin";
            headers["Cross-Origin-Resource-Policy"] = "same-origin";
            headers["Permissions-Policy"] = PermissionsPolicy;
            return Task.CompletedTask;
        });

        return _next(context);
    }
}
