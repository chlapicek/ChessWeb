namespace ChessWeb.DTOs;

public record LoggingSettingsDto(string MinimumLevel, int RetainedFileCountLimit, DateTime UpdatedAt);

public record UpdateLoggingSettingsRequest(string MinimumLevel, int RetainedFileCountLimit);
