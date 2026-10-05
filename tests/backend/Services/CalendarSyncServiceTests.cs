using System.Text;
using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace ChessWeb.Tests.Services;

public class CalendarSyncServiceTests
{
    private readonly ApplicationDbContext _context;
    private readonly CalendarSyncService _service;

    public CalendarSyncServiceTests()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        _context = new ApplicationDbContext(options);
        _service = new CalendarSyncService(
            _context,
            new StubFeedDownloader(@"BEGIN:VCALENDAR
PRODID:-//ChessWeb//Test//EN
VERSION:2.0
BEGIN:VEVENT
UID:test-event-1
SUMMARY:Blitz Tournament
DTSTART:20261002T180000Z
DTEND:20261002T210000Z
DESCRIPTION:Weekly club event
LOCATION:Prague
END:VEVENT
END:VCALENDAR"),
            NullLogger<CalendarSyncService>.Instance);
    }

    [Fact]
    public async Task SyncFeedAsync_WithIcsFeed_ImportsEventsAndUpdatesStatus()
    {
        var feed = new CalendarFeed
        {
            Id = Guid.NewGuid(),
            Name = "Test Chess Feed",
            Url = "https://example.com/events.ics",
            Type = FeedType.IcsCalendar,
            IsActive = true
        };
        _context.CalendarFeeds.Add(feed);
        await _context.SaveChangesAsync();

        var imported = await _service.SyncFeedAsync(feed.Id);

        Assert.Equal(1, imported);
        var savedEvent = await _context.CalendarEvents.SingleAsync();
        Assert.Equal("Blitz Tournament", savedEvent.Title);
        Assert.Equal(CalendarEventCategory.Tournament, savedEvent.Category);
        Assert.Equal(feed.Name, savedEvent.SourceFeedName);
        Assert.Equal("Successfully imported/updated 1 events.", feed.LastSyncStatus);
    }

    [Fact]
    public async Task SyncFeedAsync_WithHtmlDescription_StoresReadablePlainText()
    {
        var feed = new CalendarFeed
        {
            Id = Guid.NewGuid(),
            Name = "HTML Feed",
            Url = "https://example.com/html.ics",
            Type = FeedType.IcsCalendar,
            IsActive = true
        };
        _context.CalendarFeeds.Add(feed);
        await _context.SaveChangesAsync();

        var service = new CalendarSyncService(
            _context,
            new StubFeedDownloader(@"BEGIN:VCALENDAR
PRODID:-//ChessWeb//Test//EN
VERSION:2.0
BEGIN:VEVENT
UID:html-event-1
SUMMARY:HTML Event
DTSTART:20261002T180000Z
DTEND:20261002T210000Z
DESCRIPTION:<p>Weekly <strong>club</strong> event<br class=""line-break"">Bring a board &amp; clock. Score 1 &lt; 3 &gt; 0.</p>
LOCATION:Main Hall
END:VEVENT
END:VCALENDAR"),
            NullLogger<CalendarSyncService>.Instance);

        await service.SyncFeedAsync(feed.Id);

        var savedEvent = await _context.CalendarEvents.SingleAsync();
        Assert.Equal("Weekly club event\nBring a board & clock. Score 1 < 3 > 0.", savedEvent.Description);
        Assert.DoesNotContain("<strong", savedEvent.Description);
        Assert.DoesNotContain("<br", savedEvent.Description);
    }

    [Fact]
    public async Task SyncFeedAsync_DiscardsUnsafeExternalEventUrls()
    {
        var feed = new CalendarFeed
        {
            Id = Guid.NewGuid(),
            Name = "Unsafe URL Feed",
            Url = "https://example.com/events.ics",
            Type = FeedType.IcsCalendar,
            IsActive = true
        };
        _context.CalendarFeeds.Add(feed);
        await _context.SaveChangesAsync();
        var service = new CalendarSyncService(
            _context,
            new StubFeedDownloader(@"BEGIN:VCALENDAR
PRODID:-//ChessWeb//Test//EN
VERSION:2.0
BEGIN:VEVENT
UID:unsafe-url-event
SUMMARY:Unsafe Link
DTSTART:20261002T180000Z
DTEND:20261002T210000Z
URL:javascript:alert(1)
END:VEVENT
END:VCALENDAR"),
            NullLogger<CalendarSyncService>.Instance);

        await service.SyncFeedAsync(feed.Id);

        Assert.Null((await _context.CalendarEvents.SingleAsync()).ExternalUrl);
    }

    [Fact]
    public async Task SyncFeedAsync_OversizedCalendarDoesNotImportPartialEvents()
    {
        var feed = new CalendarFeed
        {
            Id = Guid.NewGuid(),
            Name = "Oversized Feed",
            Url = "https://example.com/events.ics",
            Type = FeedType.IcsCalendar,
            IsActive = true
        };
        _context.CalendarFeeds.Add(feed);
        await _context.SaveChangesAsync();

        var content = new StringBuilder("BEGIN:VCALENDAR\r\nPRODID:-//ChessWeb//Test//EN\r\nVERSION:2.0\r\n");
        for (var index = 0; index <= CalendarFeedDownloader.MaxFeedItems; index++)
        {
            content.Append("BEGIN:VEVENT\r\nUID:oversized-").Append(index)
                .Append("\r\nSUMMARY:Event\r\nDTSTART:20261002T180000Z\r\nDTEND:20261002T190000Z\r\nEND:VEVENT\r\n");
        }
        content.Append("END:VCALENDAR\r\n");
        var service = new CalendarSyncService(
            _context,
            new StubFeedDownloader(content.ToString()),
            NullLogger<CalendarSyncService>.Instance);

        await Assert.ThrowsAsync<InvalidDataException>(() => service.SyncFeedAsync(feed.Id));

        Assert.Empty(await _context.CalendarEvents.ToListAsync());
        var failedFeed = await _context.CalendarFeeds.SingleAsync();
        Assert.Equal("Feed sync failed. Check server logs for details.", failedFeed.LastSyncStatus);
    }

    [Fact]
    public async Task SyncAllFeedsAsync_PropagatesCallerCancellationDuringFeedDownload()
    {
        var feed = new CalendarFeed
        {
            Id = Guid.NewGuid(),
            Name = "Canceled Feed",
            Url = "https://example.com/events.ics",
            Type = FeedType.IcsCalendar,
            IsActive = true
        };
        _context.CalendarFeeds.Add(feed);
        await _context.SaveChangesAsync();
        using var cancellation = new CancellationTokenSource();
        var service = new CalendarSyncService(
            _context,
            new CancellingFeedDownloader(cancellation),
            NullLogger<CalendarSyncService>.Instance);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.SyncAllFeedsAsync(cancellation.Token));

        var persistedFeed = await _context.CalendarFeeds.SingleAsync();
        Assert.Null(persistedFeed.LastSyncStatus);
    }

    [Fact]
    public async Task SyncFeedAsync_DoesNotPersistExceptionDetails()
    {
        var feed = new CalendarFeed
        {
            Id = Guid.NewGuid(),
            Name = "Failing Feed",
            Url = "https://example.com/events.ics",
            Type = FeedType.IcsCalendar,
            IsActive = true
        };
        _context.CalendarFeeds.Add(feed);
        await _context.SaveChangesAsync();
        var service = new CalendarSyncService(
            _context,
            new FailingFeedDownloader(),
            NullLogger<CalendarSyncService>.Instance);

        await Assert.ThrowsAsync<HttpRequestException>(() => service.SyncFeedAsync(feed.Id));

        var failedFeed = await _context.CalendarFeeds.SingleAsync();
        Assert.Equal("Feed sync failed. Check server logs for details.", failedFeed.LastSyncStatus);
        Assert.DoesNotContain("internal-host-secret", failedFeed.LastSyncStatus, StringComparison.Ordinal);
    }

    [Fact]
    public async Task SyncAllFeedsAsync_WithMultipleFeeds_ProcessesAllActiveFeeds()
    {
        _context.CalendarFeeds.AddRange(
            new CalendarFeed { Id = Guid.NewGuid(), Name = "Alpha", Url = "https://example.com/alpha.ics", Type = FeedType.IcsCalendar, IsActive = true },
            new CalendarFeed { Id = Guid.NewGuid(), Name = "Beta", Url = "https://example.com/beta.ics", Type = FeedType.IcsCalendar, IsActive = false }
        );
        await _context.SaveChangesAsync();

        var imported = await _service.SyncAllFeedsAsync();

        Assert.Equal(1, imported);
    }

    private sealed class StubFeedDownloader(string content) : ICalendarFeedDownloader
    {
        public Task<byte[]> DownloadAsync(string feedUrl, CancellationToken cancellationToken) =>
            Task.FromResult(Encoding.UTF8.GetBytes(content));
    }

    private sealed class FailingFeedDownloader : ICalendarFeedDownloader
    {
        public Task<byte[]> DownloadAsync(string feedUrl, CancellationToken cancellationToken) =>
            Task.FromException<byte[]>(new HttpRequestException("internal-host-secret"));
    }

    private sealed class CancellingFeedDownloader(CancellationTokenSource cancellation) : ICalendarFeedDownloader
    {
        public Task<byte[]> DownloadAsync(string feedUrl, CancellationToken cancellationToken)
        {
            cancellation.Cancel();
            return Task.FromCanceled<byte[]>(cancellationToken);
        }
    }
}
