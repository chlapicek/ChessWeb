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
        return string.IsNullOrEmpty(value)
            ? string.Empty
            : value.Replace("\r", string.Empty).Replace("\n", string.Empty);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        var request = context.Request;
        var methodForLog = SanitizeForLog(request.Method);
        var pathForLog = SanitizeForLog(request.Path.ToString());
        var ipForLog = SanitizeForLog(context.Connection.RemoteIpAddress?.ToString() ?? "Unknown");

        try
        {
            await _next(context);
            stopwatch.Stop();

            var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "Anonymous";
            var userIdForLog = SanitizeForLog(userId);

            _logger.LogInformation(
                "[HTTP] {Method} {Path} responded {StatusCode} in {ElapsedMilliseconds} ms (User: {UserId}, IP: {IP})",
                methodForLog,
                pathForLog,
                context.Response.StatusCode,
                stopwatch.ElapsedMilliseconds,
                userIdForLog,
                ipForLog
            );
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _logger.LogError(
                ex,
                "[HTTP ERROR] {Method} {Path} failed after {ElapsedMilliseconds} ms (IP: {IP})",
                methodForLog,
                pathForLog,
                stopwatch.ElapsedMilliseconds,
                ipForLog
            );
            throw;
        }
    }
}
