namespace ChessWeb.Domain.Entities;

// Single-row table holding the runtime-configurable logging configuration.
public class LoggingSettings
{
    // Fixed id for the single settings row, so concurrent seeding attempts collide on the same PK instead of inserting duplicates.
    public static readonly Guid SingletonId = new("11111111-1111-1111-1111-111111111111");

    public Guid Id { get; set; } = Guid.NewGuid();
    public string MinimumLevel { get; set; } = "Information";
    public int RetainedFileCountLimit { get; set; } = 14;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
