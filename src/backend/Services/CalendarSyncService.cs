using System.Net;
using System.ServiceModel.Syndication;
using System.Text;
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
    private readonly ICalendarFeedDownloader _feedDownloader;
    private readonly ILogger<CalendarSyncService> _logger;

    public CalendarSyncService(
        ApplicationDbContext context,
        ICalendarFeedDownloader feedDownloader,
        ILogger<CalendarSyncService> logger)
    {
        _context = context;
        _feedDownloader = feedDownloader;
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
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to sync calendar feed {FeedId}", feed.Id);
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
            var feedContent = await _feedDownloader.DownloadAsync(feed.Url, cancellationToken);

            if (feed.Type == FeedType.IcsCalendar)
            {
                var calendar = global::Ical.Net.Calendar.Load(Encoding.UTF8.GetString(feedContent));
                if (calendar.Events.Count > CalendarFeedDownloader.MaxFeedItems)
                {
                    throw new InvalidDataException("Calendar feed contains too many items.");
                }

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
                            ExternalUrl = CleanExternalUrl(evt.Url?.ToString()),
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
                using var stream = new MemoryStream(feedContent, writable: false);
                using var xmlReader = XmlReader.Create(stream, new XmlReaderSettings
                {
                    DtdProcessing = DtdProcessing.Prohibit,
                    XmlResolver = null,
                    MaxCharactersInDocument = CalendarFeedDownloader.MaxResponseBytes
                });
                var rss = SyndicationFeed.Load(xmlReader);

                if (rss != null)
                {
                    var items = rss.Items.Take(CalendarFeedDownloader.MaxFeedItems + 1).ToList();
                    if (items.Count > CalendarFeedDownloader.MaxFeedItems)
                    {
                        throw new InvalidDataException("Calendar feed contains too many items.");
                    }

                    foreach (var item in items)
                    {
                        var uid = item.Id ?? item.Links.FirstOrDefault()?.Uri.ToString() ?? item.Title.Text;
                        var existing = await _context.CalendarEvents
                            .FirstOrDefaultAsync(e => e.ExternalUid == uid, cancellationToken);

                        var startTime = item.PublishDate.DateTime > DateTime.MinValue ? item.PublishDate.DateTime : DateTime.UtcNow;
                        var link = CleanExternalUrl(item.Links.FirstOrDefault()?.Uri.ToString());

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
        catch (OperationCanceledException)
        {
            _context.ChangeTracker.Clear();
            throw;
        }
        catch (Exception ex)
        {
            _context.ChangeTracker.Clear();
            _logger.LogError(ex, "Failed to sync calendar feed {FeedId}", feed.Id);
            var failedFeed = await _context.CalendarFeeds.FindAsync([feedId], CancellationToken.None);
            if (failedFeed != null)
            {
                failedFeed.LastSyncTime = DateTime.UtcNow;
                failedFeed.LastSyncStatus = "Feed sync failed. Check server logs for details.";
                try
                {
                    await _context.SaveChangesAsync(CancellationToken.None);
                }
                catch (Exception statusException)
                {
                    _logger.LogError(statusException, "Unable to persist sync status for calendar feed {FeedId}", feedId);
                }
            }
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

    private static string? CleanExternalUrl(string? value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
            !string.IsNullOrEmpty(uri.UserInfo))
        {
            return null;
        }

        return uri.AbsoluteUri;
    }
}
