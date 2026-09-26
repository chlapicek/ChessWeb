namespace ChessWeb.Domain.Entities;

public class Notification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? InternalLink { get; set; }
    public Guid? SenderUserId { get; set; }
    public string SenderName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ApplicationUser? SenderUser { get; set; }
    public ICollection<NotificationRecipient> Recipients { get; set; } = [];
}

public class NotificationRecipient
{
    public Guid NotificationId { get; set; }
    public Guid UserId { get; set; }
    public bool IsRead { get; set; }
    public DateTime? ReadAt { get; set; }
    public Notification Notification { get; set; } = null!;
    public ApplicationUser User { get; set; } = null!;
}