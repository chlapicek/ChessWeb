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
            new HttpClient(new StubHttpMessageHandler(@"BEGIN:VCALENDAR
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
END:VCALENDAR")),
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
            new HttpClient(new StubHttpMessageHandler(@"BEGIN:VCALENDAR
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
END:VCALENDAR")),
            NullLogger<CalendarSyncService>.Instance);

        await service.SyncFeedAsync(feed.Id);

        var savedEvent = await _context.CalendarEvents.SingleAsync();
        Assert.Equal("Weekly club event\nBring a board & clock. Score 1 < 3 > 0.", savedEvent.Description);
        Assert.DoesNotContain("<strong", savedEvent.Description);
        Assert.DoesNotContain("<br", savedEvent.Description);
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

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly string _content;

        public StubHttpMessageHandler(string content)
        {
            _content = content;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            return Task.FromResult(new HttpResponseMessage
            {
                StatusCode = System.Net.HttpStatusCode.OK,
                Content = new StringContent(_content)
            });
        }
    }
}
