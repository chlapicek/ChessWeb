namespace ChessWeb.DTOs;

public record SendNotificationRequest(
    string? Title,
    string? Message,
    string? InternalLink,
    string? Audience,
    IReadOnlyList<Guid>? TeamIds,
    IReadOnlyList<Guid>? UserIds,
    IReadOnlyList<string>? Roles);

public record NotificationAudienceTeamDto(Guid Id, string Name);
public record NotificationAudienceUserDto(Guid Id, string FullName, string Email);
public record NotificationAudienceOptionsDto(
    IReadOnlyList<NotificationAudienceTeamDto> Teams,
    IReadOnlyList<NotificationAudienceUserDto> Users,
    IReadOnlyList<string> Roles,
    bool IsAdministrator);

public record NotificationInboxItemDto(
    Guid Id,
    string Title,
    string Message,
    string? InternalLink,
    string SenderName,
    DateTime CreatedAt,
    bool IsRead,
    DateTime? ReadAt);

public record NotificationInboxDto(
    IReadOnlyList<NotificationInboxItemDto> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);

public record NotificationSendResult(Guid Id, int RecipientCount);