using ChessWeb.Domain.Entities;

namespace ChessWeb.DTOs;

public record PartnerReorderDto(IReadOnlyList<Guid> PartnerIds);

public record AttachmentDto(
    Guid Id,
    string FileName,
    string ContentType,
    long FileSizeBytes,
    DateTime UploadedAt
);

public record ArticleCommentDto(
    Guid Id,
    Guid ArticleId,
    string Content,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    Guid AuthorId,
    string AuthorName,
    string? AuthorRating,
    IReadOnlyList<ReactionSummaryDto> Reactions,
    bool CanEdit,
    bool CanDelete
);

public record ReactionSummaryDto(
    ArticleReactionType ReactionType,
    int Count,
    bool UserReacted
);

public record ArticleCollectionDto(
    Guid Id,
    string Name,
    IReadOnlyList<GameCollectionGameDto> Games
);

public record ArticleDto(
    Guid Id,
    string Title,
    string? Summary,
    string Content,
    ArticleContentFormat ContentFormat,
    string Excerpt,
    string? PgnData,
    string? FenData,
    bool IsPublished,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    Guid AuthorId,
    string AuthorName,
    string? AuthorRating,
    IReadOnlyList<AttachmentDto> Attachments,
    IReadOnlyList<ReactionSummaryDto> Reactions,
    int CommentsCount,
    bool CommentsLocked,
    Guid? GameCollectionId,
    ArticleCollectionDto? Collection
);

public record CreateArticleRequest(
    string Title,
    string Content,
    string? Summary = null,
    string? PgnData = null,
    string? FenData = null,
    ArticleContentFormat ContentFormat = ArticleContentFormat.PlainText,
    Guid? GameCollectionId = null
);

// GameCollectionId is always applied: null unlinks the collection.
public record UpdateArticleRequest(
    string Title,
    string Content,
    string? Summary = null,
    string? PgnData = null,
    string? FenData = null,
    bool? IsPublished = null,
    ArticleContentFormat ContentFormat = ArticleContentFormat.PlainText,
    Guid? GameCollectionId = null
);

public record CreateCommentRequest(
    string Content
);

public record SetCommentsLockRequest(
    bool Locked
);

public record CommentsLockDto(
    bool CommentsLocked
);

public record ToggleReactionRequest(
    ArticleReactionType ReactionType
);

public record CreateCalendarEventRequest(
    string Title,
    string? Description,
    string? Location,
    DateTime StartTime,
    DateTime EndTime,
    bool IsAllDay,
    CalendarEventCategory Category,
    RecurrenceType Recurrence = RecurrenceType.None,
    int RecurrenceCount = 1,
    DateTime? RecurrenceEndDate = null
);

public record PagedResult<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int PageNumber,
    int PageSize,
    int TotalPages
);
