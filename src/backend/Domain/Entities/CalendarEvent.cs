namespace ChessWeb.Domain.Entities;

public enum CalendarEventCategory
{
    Tournament,
    LeagueMatch,
    ClubNight,
    TrainingSeminar,
    Other
}

public enum RecurrenceType
{
    None = 0,
    Daily = 1,
    Weekly = 2,
    BiWeekly = 3,
    Monthly = 4
}

public class CalendarEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public DateTime StartTime { get; set; }
    public DateTime EndTime { get; set; }
    public bool IsAllDay { get; set; }
    public CalendarEventCategory Category { get; set; } = CalendarEventCategory.Tournament;
    public RecurrenceType Recurrence { get; set; } = RecurrenceType.None;
    public Guid? RecurrenceGroupId { get; set; }
    public string? ExternalUrl { get; set; }
    public string? ExternalUid { get; set; }
    public string? SourceFeedName { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class EventSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public Guid CalendarEventId { get; set; }
    public CalendarEvent Event { get; set; } = null!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum FeedType
{
    IcsCalendar,
    RssFeed
}

public class CalendarFeed
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public FeedType Type { get; set; } = FeedType.IcsCalendar;
    public bool IsActive { get; set; } = true;
    public DateTime? LastSyncTime { get; set; }
    public string? LastSyncStatus { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
