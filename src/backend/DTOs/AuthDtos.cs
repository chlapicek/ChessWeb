namespace ChessWeb.DTOs;

public record RegisterRequest(
    string Email,
    string Password,
    string FullName,
    string? ChessRating,
    string? FideId,
    string? Nickname
);

public record LoginRequest(
    string EmailOrNickname,
    string Password
);

public record AuthResponse(
    string Token,
    string RefreshToken,
    DateTime ExpiresAt,
    UserDto User
);

public record UserDto(
    Guid Id,
    string Email,
    string? Nickname,
    string FullName,
    string? ChessRating,
    string? FideId,
    IReadOnlyList<string> Roles
);

public record ChangeRoleRequest(
    Guid UserId,
    List<string> Roles
);
