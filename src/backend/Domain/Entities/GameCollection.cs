namespace ChessWeb.Domain.Entities;

public class GameCollection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public Guid CreatedByUserId { get; set; }
    public ApplicationUser? CreatedByUser { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<GameCollectionGame> Games { get; set; } = [];
}

public class GameCollectionGame
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid GameCollectionId { get; set; }
    public GameCollection GameCollection { get; set; } = null!;
    public int OrderIndex { get; set; }
    public string Pgn { get; set; } = string.Empty;
    public string? Label { get; set; }
}
