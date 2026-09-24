using System.Net;
using System.ServiceModel.Syndication;
using System.Text.RegularExpressions;
using System.Xml;
using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using Ical.Net;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Services;

public interface ICalendarSyncService
{
    Task<int> SyncAllFeedsAsync(CancellationToken cancellationToken = default);
    Task<int> SyncFeedAsync(Guid feedId, CancellationToken cancellationToken = default);
}

public class CalendarSyncService : ICalendarSyncService
{
    private readonly ApplicationDbContext _context;
    private readonly HttpClient _httpClient;
    private readonly ILogger<CalendarSyncService> _logger;

    public CalendarSyncService(
        ApplicationDbContext context,
        HttpClient httpClient,
        ILogger<CalendarSyncService> logger)
    {
        _context = context;
        _httpClient = httpClient;
        _logger = logger;
    }

    public async Task<int> SyncAllFeedsAsync(CancellationToken cancellationToken = default)
    {
        var activeFeeds = await _context.CalendarFeeds
            .Where(f => f.IsActive)
            .ToListAsync(cancellationToken);

        int totalImported = 0;
        foreach (var feed in activeFeeds)
        {
            try
            {
                totalImported += await SyncFeedAsync(feed.Id, cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to sync feed {FeedName} ({Url})", feed.Name, feed.Url);
            }
        }

        return totalImported;
    }

    public async Task<int> SyncFeedAsync(Guid feedId, CancellationToken cancellationToken = default)
    {
        var feed = await _context.CalendarFeeds.FindAsync([feedId], cancellationToken);
        if (feed == null)
        {
            return 0;
        }

        int count = 0;
        try
        {
            var response = await _httpClient.GetAsync(feed.Url, cancellationToken);
            response.EnsureSuccessStatusCode();

            if (feed.Type == FeedType.IcsCalendar)
            {
                var content = await response.Content.ReadAsStringAsync(cancellationToken);
                var calendar = global::Ical.Net.Calendar.Load(content);

                foreach (var evt in calendar.Events)
                {
                    var uid = evt.Uid ?? $"{feed.Name}_{evt.Start?.Value:yyyyMMddHHmmss}_{evt.Summary}";
                    var existing = await _context.CalendarEvents
                        .FirstOrDefaultAsync(e => e.ExternalUid == uid, cancellationToken);

                    var startTime = evt.Start?.Value ?? DateTime.UtcNow;
                    var endTime = evt.End?.Value ?? startTime.AddHours(2);

                    if (existing == null)
                    {
                        var newEvent = new CalendarEvent
                        {
                            Title = CleanFeedText(evt.Summary) ?? "Untitled Chess Event",
                            Description = CleanFeedText(evt.Description) ?? string.Empty,
                            Location = CleanFeedText(evt.Location) ?? string.Empty,
                            StartTime = startTime,
                            EndTime = endTime,
                            IsAllDay = evt.IsAllDay,
                            Category = CategorizeEvent(evt.Summary ?? ""),
                            ExternalUrl = evt.Url?.ToString(),
                            ExternalUid = uid,
                            SourceFeedName = feed.Name,
                            CreatedAt = DateTime.UtcNow
                        };
                        _context.CalendarEvents.Add(newEvent);
                    }
                    else
                    {
                        existing.Title = CleanFeedText(evt.Summary) ?? existing.Title;
                        existing.Description = CleanFeedText(evt.Description) ?? existing.Description;
                        existing.Location = CleanFeedText(evt.Location) ?? existing.Location;
                        existing.StartTime = startTime;
                        existing.EndTime = endTime;
                        existing.IsAllDay = evt.IsAllDay;
                    }
                    count++;
                }
            }
            else if (feed.Type == FeedType.RssFeed)
            {
                using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                using var xmlReader = XmlReader.Create(stream);
                var rss = SyndicationFeed.Load(xmlReader);

                if (rss != null)
                {
                    foreach (var item in rss.Items)
                    {
                        var uid = item.Id ?? item.Links.FirstOrDefault()?.Uri.ToString() ?? item.Title.Text;
                        var existing = await _context.CalendarEvents
                            .FirstOrDefaultAsync(e => e.ExternalUid == uid, cancellationToken);

                        var startTime = item.PublishDate.DateTime > DateTime.MinValue ? item.PublishDate.DateTime : DateTime.UtcNow;
                        var link = item.Links.FirstOrDefault()?.Uri.ToString();

                        if (existing == null)
                        {
                            var newEvent = new CalendarEvent
                            {
                                Title = CleanFeedText(item.Title?.Text) ?? "Untitled Chess Event",
                                Description = CleanFeedText(item.Summary?.Text) ?? string.Empty,
                                Location = "External Event",
                                StartTime = startTime,
                                EndTime = startTime.AddHours(3),
                                IsAllDay = false,
                                Category = CategorizeEvent(item.Title.Text),
                                ExternalUrl = link,
                                ExternalUid = uid,
                                SourceFeedName = feed.Name,
                                CreatedAt = DateTime.UtcNow
                            };
                            _context.CalendarEvents.Add(newEvent);
                        }
                        else
                        {
                            existing.Title = CleanFeedText(item.Title?.Text) ?? existing.Title;
                            existing.Description = CleanFeedText(item.Summary?.Text) ?? existing.Description;
                            existing.StartTime = startTime;
                        }
                        count++;
                    }
                }
            }

            feed.LastSyncTime = DateTime.UtcNow;
            feed.LastSyncStatus = $"Successfully imported/updated {count} events.";
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            feed.LastSyncTime = DateTime.UtcNow;
            feed.LastSyncStatus = $"Error: {ex.Message}";
            await _context.SaveChangesAsync(cancellationToken);
            throw;
        }

        return count;
    }

    private static CalendarEventCategory CategorizeEvent(string summary)
    {
        var s = summary.ToLowerInvariant();
        if (s.Contains("extraliga") || s.Contains("liga") || s.Contains("match") || s.Contains("kolo") || s.Contains("zapas"))
        {
            return CalendarEventCategory.LeagueMatch;
        }
        if (s.Contains("turnaj") || s.Contains("tournament") || s.Contains("open") || s.Contains("memorial") || s.Contains("cup") || s.Contains("pohar"))
        {
            return CalendarEventCategory.Tournament;
        }
        if (s.Contains("trenink") || s.Contains("training") || s.Contains("seminar") || s.Contains("lecture") || s.Contains("prednaska"))
        {
            return CalendarEventCategory.TrainingSeminar;
        }
        if (s.Contains("klub") || s.Contains("schuzka") || s.Contains("club night"))
        {
            return CalendarEventCategory.ClubNight;
        }
        return CalendarEventCategory.Tournament;
    }

    private static string? CleanFeedText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var decoded = WebUtility.HtmlDecode(value);
        decoded = Regex.Replace(decoded, @"<\s*br\b[^>]*>", "\n", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        decoded = Regex.Replace(decoded, @"</\s*(p|div|li|h[1-6])\s*>", "\n", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        decoded = Regex.Replace(
            decoded,
            @"<\s*/?\s*(?:a|abbr|b|br|blockquote|code|div|em|h[1-6]|i|li|ol|p|pre|small|span|strong|u|ul)\b[^>]*>",
            string.Empty,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        return Regex.Replace(decoded, @"[ \t]+\n", "\n").Trim();
    }
}
