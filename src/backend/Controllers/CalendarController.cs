using System.Security.Claims;
using System.Data;
using System.Text;
using System.Text.RegularExpressions;
using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using ChessWeb.Services;
using Ical.Net.DataTypes;
using Ical.Net.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CalendarController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ICalendarSyncService _syncService;
    private readonly ILogger<CalendarController> _logger;

    public CalendarController(
        ApplicationDbContext context,
        ICalendarSyncService syncService,
        ILogger<CalendarController> logger)
    {
        _context = context;
        _syncService = syncService;
        _logger = logger;
    }

    [HttpGet("events")]
    [AllowAnonymous]
    public async Task<ActionResult<IEnumerable<CalendarEvent>>> GetEvents(
        [FromQuery] DateTime? start,
        [FromQuery] DateTime? end,
        [FromQuery] CalendarEventCategory? category)
    {
        var query = _context.CalendarEvents.AsNoTracking();

        if (start.HasValue)
        {
            query = query.Where(e => e.EndTime >= start.Value);
        }

        if (end.HasValue)
        {
            query = query.Where(e => e.StartTime <= end.Value);
        }

        if (category.HasValue)
        {
            query = query.Where(e => e.Category == category.Value);
        }

        var events = await query
            .OrderBy(e => e.StartTime)
            .ToListAsync();

        return Ok(events);
    }

    [HttpPost("events")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<IEnumerable<CalendarEvent>>> CreateEvent([FromBody] CreateCalendarEventRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
        {
            return BadRequest(new { message = "Event title is required." });
        }

        if (request.EndTime < request.StartTime)
        {
            return BadRequest(new { message = "End time must be after or equal to start time." });
        }

        var duration = request.EndTime - request.StartTime;
        var createdEvents = new List<CalendarEvent>();

        if (request.Recurrence == RecurrenceType.None)
        {
            var singleEvent = new CalendarEvent
            {
                Id = Guid.NewGuid(),
                Title = request.Title,
                Description = request.Description ?? string.Empty,
                Location = request.Location ?? string.Empty,
                StartTime = request.StartTime,
                EndTime = request.EndTime,
                IsAllDay = request.IsAllDay,
                Category = request.Category,
                Recurrence = RecurrenceType.None,
                RecurrenceGroupId = null,
                CreatedAt = DateTime.UtcNow
            };
            _context.CalendarEvents.Add(singleEvent);
            createdEvents.Add(singleEvent);
        }
        else
        {
            var seriesId = Guid.NewGuid();
            var occurrences = Math.Clamp(request.RecurrenceCount, 1, 52); // Max 52 occurrences limit
            var curStart = request.StartTime;

            for (int i = 0; i < occurrences; i++)
            {
                if (request.RecurrenceEndDate.HasValue && curStart > request.RecurrenceEndDate.Value)
                {
                    break;
                }

                var evt = new CalendarEvent
                {
                    Id = Guid.NewGuid(),
                    Title = request.Title,
                    Description = request.Description ?? string.Empty,
                    Location = request.Location ?? string.Empty,
                    StartTime = curStart,
                    EndTime = curStart + duration,
                    IsAllDay = request.IsAllDay,
                    Category = request.Category,
                    Recurrence = request.Recurrence,
                    RecurrenceGroupId = seriesId,
                    CreatedAt = DateTime.UtcNow
                };

                _context.CalendarEvents.Add(evt);
                createdEvents.Add(evt);

                curStart = request.Recurrence switch
                {
                    RecurrenceType.Daily => curStart.AddDays(1),
                    RecurrenceType.Weekly => curStart.AddDays(7),
                    RecurrenceType.BiWeekly => curStart.AddDays(14),
                    RecurrenceType.Monthly => curStart.AddMonths(1),
                    _ => curStart.AddDays(7)
                };
            }
        }

        await _context.SaveChangesAsync();
        var safeTitleForLog = Regex.Replace(request.Title ?? string.Empty, @"[\r\n\0\f\v\u0085\u2028\u2029]+", " ");
        _logger.LogInformation("Created {Count} calendar event(s) for '{Title}'", createdEvents.Count, safeTitleForLog);

        return Ok(createdEvents);
    }

    [HttpDelete("events/{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeleteEvent(Guid id, [FromQuery] bool deleteSeries = false)
    {
        var evt = await _context.CalendarEvents.FindAsync(id);
        if (evt == null)
        {
            return NotFound();
        }

        if (deleteSeries && evt.RecurrenceGroupId.HasValue)
        {
            var seriesEvents = await _context.CalendarEvents
                .Where(e => e.RecurrenceGroupId == evt.RecurrenceGroupId.Value)
                .ToListAsync();

            _context.CalendarEvents.RemoveRange(seriesEvents);
            _logger.LogInformation("Deleted {Count} events from series {SeriesId}", seriesEvents.Count, evt.RecurrenceGroupId.Value);
        }
        else
        {
            _context.CalendarEvents.Remove(evt);
            _logger.LogInformation("Deleted single calendar event {Id} ('{Title}')", evt.Id, evt.Title);
        }

        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("events/{id:guid}/ics")]
    [AllowAnonymous]
    public async Task<IActionResult> ExportEventIcs(Guid id, CancellationToken cancellationToken)
    {
        var evt = await _context.CalendarEvents.AsNoTracking().FirstOrDefaultAsync(e => e.Id == id, cancellationToken);
        if (evt == null)
        {
            return NotFound();
        }

        var calendar = BuildIcsCalendar([evt]);
        var bytes = SerializeCalendarToBytes(calendar);
        var fileName = SanitizeIcsFileName(evt.Title) + ".ics";

        return File(bytes, "text/calendar; charset=utf-8", fileName);
    }

    [HttpGet("events/series/{recurrenceGroupId:guid}/ics")]
    [AllowAnonymous]
    public async Task<IActionResult> ExportSeriesIcs(Guid recurrenceGroupId, CancellationToken cancellationToken)
    {
        var seriesEvents = await _context.CalendarEvents
            .AsNoTracking()
            .Where(e => e.RecurrenceGroupId == recurrenceGroupId)
            .OrderBy(e => e.StartTime)
            .ToListAsync(cancellationToken);

        if (seriesEvents.Count == 0)
        {
            return NotFound();
        }

        var calendar = BuildIcsCalendar(seriesEvents);
        var bytes = SerializeCalendarToBytes(calendar);
        var fileName = SanitizeIcsFileName(seriesEvents[0].Title) + "-series.ics";

        return File(bytes, "text/calendar; charset=utf-8", fileName);
    }

    private static global::Ical.Net.Calendar BuildIcsCalendar(IEnumerable<CalendarEvent> events)
    {
        var calendar = new global::Ical.Net.Calendar();

        foreach (var evt in events)
        {
            var vEvent = new global::Ical.Net.CalendarComponents.CalendarEvent
            {
                Uid = evt.ExternalUid ?? evt.Id.ToString(),
                Summary = evt.Title,
                Description = evt.Description,
                Location = evt.Location,
                Start = new CalDateTime(evt.StartTime, hasTime: !evt.IsAllDay),
                End = new CalDateTime(evt.EndTime, hasTime: !evt.IsAllDay)
            };
            calendar.Events.Add(vEvent);
        }

        return calendar;
    }

    private static byte[] SerializeCalendarToBytes(global::Ical.Net.Calendar calendar)
    {
        var serializer = new CalendarSerializer();
        var text = serializer.SerializeToString(calendar) ?? string.Empty;
        return Encoding.UTF8.GetBytes(text);
    }

    private static string SanitizeIcsFileName(string name)
    {
        var sanitized = Regex.Replace(name, "[^a-zA-Z0-9-_ ]", "").Trim();
        return string.IsNullOrWhiteSpace(sanitized) ? "calendar-event" : sanitized;
    }

    [HttpGet("feeds")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<IEnumerable<CalendarFeed>>> GetFeeds()
    {
        var feeds = await _context.CalendarFeeds.AsNoTracking().ToListAsync();
        return Ok(feeds);
    }

    [HttpPost("feeds")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<CalendarFeed>> AddFeed([FromBody] CalendarFeed feed)
    {
        if (string.IsNullOrWhiteSpace(feed.Name) || string.IsNullOrWhiteSpace(feed.Url))
        {
            return BadRequest(new { message = "Feed name and URL are required." });
        }

        feed.Id = Guid.NewGuid();
        feed.CreatedAt = DateTime.UtcNow;
        _context.CalendarFeeds.Add(feed);
        await _context.SaveChangesAsync();

        return Ok(feed);
    }

    [HttpPost("feeds/{feedId:guid}/sync")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> SyncSingleFeed(Guid feedId, CancellationToken cancellationToken)
    {
        try
        {
            var count = await _syncService.SyncFeedAsync(feedId, cancellationToken);
            return Ok(new { message = $"Synchronized successfully. Processed {count} events." });
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Calendar feed synchronization failed for {FeedId}", feedId);
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Calendar feed synchronization failed." });
        }
    }

    [HttpPost("sync-all")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> SyncAllFeeds(CancellationToken cancellationToken)
    {
        try
        {
            var count = await _syncService.SyncAllFeedsAsync(cancellationToken);
            return Ok(new { message = $"Synchronized all feeds successfully. Processed {count} events." });
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Calendar feed synchronization failed for all feeds");
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Calendar feed synchronization failed." });
        }
    }

    [HttpPost("events/{id:guid}/subscribe")]
    [Authorize]
    public async Task<IActionResult> SubscribeToEvent(Guid id)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized();
        }

        var eventExists = await _context.CalendarEvents.AnyAsync(e => e.Id == id);
        if (!eventExists)
        {
            return NotFound(new { message = "Event not found." });
        }

        var alreadySubscribed = await _context.EventSubscriptions
            .AnyAsync(s => s.UserId == userId.Value && s.CalendarEventId == id);

        if (!alreadySubscribed)
        {
            _context.EventSubscriptions.Add(new EventSubscription
            {
                UserId = userId.Value,
                CalendarEventId = id
            });
            await _context.SaveChangesAsync();
        }

        return Ok(new { message = "Subscribed." });
    }

    [HttpPost("events/series/{seriesId:guid}/subscribe")]
    [Authorize]
    public async Task<IActionResult> SubscribeToSeries(Guid seriesId)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized();
        }

        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

        var eventIds = await _context.CalendarEvents
            .Where(e => e.RecurrenceGroupId == seriesId)
            .Select(e => e.Id)
            .ToListAsync();

        if (eventIds.Count == 0)
        {
            return NotFound(new { message = "Event series not found." });
        }

        var subscribedEventIds = await _context.EventSubscriptions
            .Where(s => s.UserId == userId.Value && eventIds.Contains(s.CalendarEventId))
            .Select(s => s.CalendarEventId)
            .ToListAsync();

        var newSubscriptions = eventIds
            .Except(subscribedEventIds)
            .Select(eventId => new EventSubscription
            {
                UserId = userId.Value,
                CalendarEventId = eventId
            });

        _context.EventSubscriptions.AddRange(newSubscriptions);
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();

        return Ok(new { message = "Subscribed to series." });
    }

    [HttpDelete("events/{id:guid}/subscribe")]
    [Authorize]
    public async Task<IActionResult> UnsubscribeFromEvent(Guid id)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized();
        }

        var subscription = await _context.EventSubscriptions
            .FirstOrDefaultAsync(s => s.UserId == userId.Value && s.CalendarEventId == id);

        if (subscription != null)
        {
            _context.EventSubscriptions.Remove(subscription);
            await _context.SaveChangesAsync();
        }

        return NoContent();
    }

    [HttpDelete("events/series/{seriesId:guid}/subscribe")]
    [Authorize]
    public async Task<IActionResult> UnsubscribeFromSeries(Guid seriesId)
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized();
        }

        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

        var eventIds = await _context.CalendarEvents
            .Where(e => e.RecurrenceGroupId == seriesId)
            .Select(e => e.Id)
            .ToListAsync();

        if (eventIds.Count == 0)
        {
            return NotFound(new { message = "Event series not found." });
        }

        var subscriptions = await _context.EventSubscriptions
            .Where(s => s.UserId == userId.Value && eventIds.Contains(s.CalendarEventId))
            .ToListAsync();

        _context.EventSubscriptions.RemoveRange(subscriptions);
        await _context.SaveChangesAsync();
        await transaction.CommitAsync();

        return NoContent();
    }

    [HttpGet("my-subscriptions")]
    [Authorize]
    public async Task<ActionResult<IEnumerable<CalendarEvent>>> GetMySubscriptions()
    {
        var userId = GetCurrentUserId();
        if (userId == null)
        {
            return Unauthorized();
        }

        var events = await _context.EventSubscriptions
            .AsNoTracking()
            .Where(s => s.UserId == userId.Value)
            .Select(s => s.Event)
            .OrderBy(e => e.StartTime)
            .ToListAsync();

        return Ok(events);
    }

    private Guid? GetCurrentUserId()
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(userIdStr, out var userId) ? userId : null;
    }
}
