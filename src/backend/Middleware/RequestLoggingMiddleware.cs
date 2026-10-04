using System.Diagnostics;
using System.Security.Claims;

namespace ChessWeb.Middleware;

public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    private static string SanitizeForLog(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        return value.Replace("\r", string.Empty).Replace("\n", string.Empty);
    }

    private static string SanitizeForLog(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        var sanitizedMethod = SanitizeForLog(request.Method);
        }

        return value.Replace("\r", "").Replace("\n", "");
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        var request = context.Request;
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "Unknown";
        var sanitizedPath = SanitizeForLog(request.Path.ToString());
                sanitizedMethod,
        try
        {
            await _next(context);
            stopwatch.Stop();

            var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "Anonymous";
            var statusCode = context.Response.StatusCode;

            _logger.LogInformation(
                "[HTTP] {Method} {Path} responded {StatusCode} in {ElapsedMilliseconds} ms (User: {UserId}, IP: {IP})",
                request.Method,
                sanitizedPath,
                statusCode,
                sanitizedMethod,
                userId,
                ip
            );
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _logger.LogError(
                ex,
                "[HTTP ERROR] {Method} {Path} failed after {ElapsedMilliseconds} ms (IP: {IP})",
                request.Method,
                sanitizedPath,
                stopwatch.ElapsedMilliseconds,
                ip
            );
            throw;
        }
    }
}
