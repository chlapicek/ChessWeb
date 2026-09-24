namespace ChessWeb.Domain.Entities;

public enum ArticleReactionType
{
    Like,       // 👍
    Heart,      // ❤️
    Chess,      // ♟️
    Insightful, // 💡
    Trophy      // 🏆
}

public class Article
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string? Summary { get; set; }
    public string Content { get; set; } = string.Empty; // Markdown or rich text
    public string? PgnData { get; set; } // Optional embedded PGN for interactive chess board
    public string? FenData { get; set; } // Optional initial FEN
    public bool IsPublished { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public Guid AuthorId { get; set; }
    public ApplicationUser Author { get; set; } = null!;

    public ICollection<Attachment> Attachments { get; set; } = [];
    public ICollection<ArticleComment> Comments { get; set; } = [];
    public ICollection<ArticleReaction> Reactions { get; set; } = [];
}

public class ArticleComment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public Guid ArticleId { get; set; }
    public Article Article { get; set; } = null!;

    public Guid AuthorId { get; set; }
    public ApplicationUser Author { get; set; } = null!;
}

public class ArticleReaction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public ArticleReactionType ReactionType { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Guid ArticleId { get; set; }
    public Article Article { get; set; } = null!;

    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
}
