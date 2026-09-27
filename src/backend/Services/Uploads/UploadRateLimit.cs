namespace ChessWeb.Services.Uploads;

/// <summary>Per-user rate limit applied to every endpoint that accepts file uploads (Uploads:RateLimitPerMinute).</summary>
public static class UploadRateLimit
{
    public const string PolicyName = "uploads";
    public const string ConfigurationKey = "Uploads:RateLimitPerMinute";
    public const int DefaultPermitsPerMinute = 20;
}
