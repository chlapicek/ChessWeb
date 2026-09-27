namespace ChessWeb.Domain.Entities;

public class Attachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;

    public Guid? ArticleId { get; set; }
    public Article? Article { get; set; }

    public Guid? UploadedByUserId { get; set; }

    // Set when a malware rescan flags the stored file; quarantined files are never served.
    public DateTime? QuarantinedAt { get; set; }
    public string? QuarantineReason { get; set; }
    public DateTime? LastScannedAt { get; set; }

}
