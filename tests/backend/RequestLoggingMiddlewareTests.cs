using System.Security.Claims;
using System.Text;
using ChessWeb.Middleware;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace ChessWeb.Tests.Middleware;

public class RequestLoggingMiddlewareTests
{
    [Fact]
    public async Task ExceptionHandlingMiddleware_DoesNotExposeExceptionDetails()
    {
        const string secret = "internal database hostname";
        var logger = new Mock<ILogger<ExceptionHandlingMiddleware>>();
        var context = new DefaultHttpContext();
        await using var responseBody = new MemoryStream();
        context.Response.Body = responseBody;
        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new InvalidOperationException(secret),
            logger.Object);

        await middleware.InvokeAsync(context);

        responseBody.Position = 0;
        var response = await new StreamReader(responseBody, Encoding.UTF8).ReadToEndAsync();

        Assert.Equal(StatusCodes.Status500InternalServerError, context.Response.StatusCode);
        Assert.Contains("An unexpected error occurred", response, StringComparison.Ordinal);
        Assert.DoesNotContain(secret, response, StringComparison.Ordinal);
        Assert.DoesNotContain("detail", response, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task InvokeAsync_SanitizesRequestValuesBeforeLogging()
    {
        var logger = new Mock<ILogger<RequestLoggingMiddleware>>();
        var context = new DefaultHttpContext();
        context.Request.Method = "GET\r\nInjected";
        context.Request.Path = new PathString("/articles\r\nInjected");
        context.User = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, "member\r\nInjected")],
            "test"));
        var middleware = new RequestLoggingMiddleware(_ => Task.CompletedTask, logger.Object);

        await middleware.InvokeAsync(context);

        var informationLog = Assert.Single(logger.Invocations, invocation =>
            invocation.Method.Name == nameof(ILogger.Log) &&
            (LogLevel)invocation.Arguments[0]! == LogLevel.Information);
        var message = informationLog.Arguments[2]?.ToString() ?? string.Empty;

        Assert.Contains("GETInjected", message);
        Assert.Contains("/articles%0D%0AInjected", message);
        Assert.Contains("memberInjected", message);
        Assert.DoesNotContain("\r", message);
        Assert.DoesNotContain("\n", message);
    }

    [Fact]
    public async Task InvokeAsync_LogsAndRethrowsOriginalException()
    {
        var logger = new Mock<ILogger<RequestLoggingMiddleware>>();
        var expectedException = new InvalidOperationException("request failed");
        var middleware = new RequestLoggingMiddleware(
            _ => Task.FromException(expectedException),
            logger.Object);

        var thrownException = await Assert.ThrowsAsync<InvalidOperationException>(
            () => middleware.InvokeAsync(new DefaultHttpContext()));

        Assert.Same(expectedException, thrownException);
        logger.Verify(log => log.Log(
            LogLevel.Error,
            It.IsAny<EventId>(),
            It.Is<It.IsAnyType>((state, _) => state!.ToString()!.Contains("[HTTP ERROR]", StringComparison.Ordinal)),
            expectedException,
            It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }
}
