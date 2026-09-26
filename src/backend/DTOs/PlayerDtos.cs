namespace ChessWeb.DTOs;

public record UpdatePlayerRequest(
    string FullName,
    string Email,
    string? ChessRating,
    string? FideId,
    string? Nickname
);

public record UpdateNicknameRequest(string? Nickname);

public record PlayerSummaryDto(
    Guid Id,
    string? FullName,
    string? Nickname,
    string? ChessRating,
    string? FideId
);

public record PlayerProfileDto(
    Guid Id,
    string? FullName,
    string? Nickname,
    string? ChessRating,
    string? FideId,
    bool IsSelf
);
