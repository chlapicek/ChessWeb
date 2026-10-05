using System.Net;
using System.Net.Sockets;
using ChessWeb.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace ChessWeb.Tests.Services;

public class CalendarFeedDownloaderTests
{
    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData("10.1.2.3")]
    [InlineData("169.254.10.20")]
    [InlineData("::1")]
    [InlineData("fd00::1")]
    [InlineData("2001:db8::1")]
    [InlineData("2002:7f00:1::")]
    public void IsPublicAddress_RejectsSpecialPurposeRanges(string address)
    {
        Assert.False(CalendarFeedAddressResolver.IsPublicAddress(IPAddress.Parse(address)));
    }

    [Theory]
    [InlineData("93.184.216.34")]
    [InlineData("2606:4700:4700::1111")]
    public void IsPublicAddress_AllowsGlobalUnicast(string address)
    {
        Assert.True(CalendarFeedAddressResolver.IsPublicAddress(IPAddress.Parse(address)));
    }

    [Fact]
    public async Task DownloadAsync_RejectsLoopbackBeforeSendingRequest()
    {
        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK));
        var downloader = CreateDownloader(handler);

        await Assert.ThrowsAsync<HttpRequestException>(() => downloader.DownloadAsync("https://127.0.0.1/feed.ics", CancellationToken.None));

        Assert.Equal(0, handler.RequestCount);
    }

    [Fact]
    public async Task DownloadAsync_RevalidatesRedirectDestination()
    {
        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.Redirect)
        {
            Headers = { Location = new Uri("https://127.0.0.1/internal") }
        });
        var downloader = CreateDownloader(handler);

        await Assert.ThrowsAsync<HttpRequestException>(() => downloader.DownloadAsync("https://feeds.example.org/calendar.ics", CancellationToken.None));

        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task DownloadAsync_RejectsHttpRedirectsInProduction()
    {
        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.Redirect)
        {
            Headers = { Location = new Uri("http://feeds.example.org/insecure") }
        });
        var downloader = CreateDownloader(handler);

        await Assert.ThrowsAsync<HttpRequestException>(() => downloader.DownloadAsync("https://feeds.example.org/calendar.ics", CancellationToken.None));

        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task DownloadAsync_EnforcesRedirectLimit()
    {
        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.Redirect)
        {
            Headers = { Location = new Uri("https://feeds.example.org/redirect") }
        });
        var downloader = CreateDownloader(handler);

        await Assert.ThrowsAsync<HttpRequestException>(() => downloader.DownloadAsync("https://feeds.example.org/calendar.ics", CancellationToken.None));

        Assert.Equal(CalendarFeedDownloader.MaxRedirects + 1, handler.RequestCount);
    }

    [Fact]
    public async Task DownloadAsync_RejectsOversizedResponse()
    {
        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(new byte[CalendarFeedDownloader.MaxResponseBytes + 1])
        });
        var downloader = CreateDownloader(handler);

        await Assert.ThrowsAsync<HttpRequestException>(() => downloader.DownloadAsync("https://feeds.example.org/calendar.ics", CancellationToken.None));
    }

    [Fact]
    public async Task DownloadAsync_ConvertsInternalCancellationToTimeoutFailure()
    {
        var handler = new StubHttpMessageHandler(_ => throw new OperationCanceledException("handler timeout"));
        var downloader = CreateDownloader(handler);

        var exception = await Assert.ThrowsAsync<HttpRequestException>(
            () => downloader.DownloadAsync("https://feeds.example.org/calendar.ics", CancellationToken.None));

        Assert.Equal("Calendar feed request timed out.", exception.Message);
    }

    [Fact]
    public async Task DownloadAsync_ReturnsPublicFeedContent()
    {
        const string feed = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";
        var handler = new StubHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(feed)
        });
        var downloader = CreateDownloader(handler);

        var result = await downloader.DownloadAsync("https://feeds.example.org/calendar.ics", CancellationToken.None);

        Assert.Equal(feed, System.Text.Encoding.UTF8.GetString(result));
        Assert.Equal(1, handler.RequestCount);
    }

    private static CalendarFeedDownloader CreateDownloader(StubHttpMessageHandler handler) =>
        new(new HttpClient(handler), new PublicTestAddressResolver(), new TestHostEnvironment());

    private sealed class PublicTestAddressResolver : ICalendarFeedAddressResolver
    {
        public Task<IReadOnlyList<IPAddress>> ResolvePublicAddressesAsync(string host, CancellationToken cancellationToken)
        {
            var address = IPAddress.TryParse(host, out var literal) ? literal : IPAddress.Parse("93.184.216.34");
            if (!CalendarFeedAddressResolver.IsPublicAddress(address))
            {
                throw new HttpRequestException("Calendar feed host is not publicly routable.");
            }

            return Task.FromResult<IReadOnlyList<IPAddress>>([address]);
        }

        public ValueTask<Stream> ConnectAsync(SocketsHttpConnectionContext context, CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }

    private sealed class StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> responseFactory) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestCount++;
            return Task.FromResult(responseFactory(request));
        }
    }

    private sealed class TestHostEnvironment : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "ChessWeb.Tests";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = string.Empty;
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}