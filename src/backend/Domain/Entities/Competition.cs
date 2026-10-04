namespace ChessWeb.Domain.Entities;

public class Competition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Season { get; set; } = string.Empty;
    public string League { get; set; } = string.Empty;
    public string Venue { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public Guid? TeamId { get; set; }
    public Team? Team { get; set; }
}

public enum AvailabilityStatus
{
    Pending,
    Available,
    Unavailable,
    Tentative
}

public enum MatchPlayerTag
{
    None,
    Cizinec,
    Host,
    Vyssi
}

public class TeamAvailabilityEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeamId { get; set; }
    public Team Team { get; set; } = null!;
    public Guid? PlayerUserId { get; set; }
    public ApplicationUser? PlayerUser { get; set; }
    public string PlayerName { get; set; } = string.Empty;
    public string? PlayerRating { get; set; }
    public int RoundNumber { get; set; }
    public DateTime MatchDate { get; set; }
    public string OpponentTeam { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public bool IsHomeMatch { get; set; }
    public AvailabilityStatus Status { get; set; }
    public bool IsDriver { get; set; }
    public string? Notes { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class TeamAvailabilityDate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeamId { get; set; }
    public Team Team { get; set; } = null!;
    public int RoundNumber { get; set; }
    public DateTime MatchDate { get; set; }
    public string OpponentTeam { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public bool IsHomeMatch { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class TeamAvailabilityPlayer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TeamId { get; set; }
    public Team Team { get; set; } = null!;
    public Guid? PlayerUserId { get; set; }
    public ApplicationUser? PlayerUser { get; set; }
    public string PlayerName { get; set; } = string.Empty;
    public string? PlayerRating { get; set; }
    public bool IsZaklad { get; set; }
    // C/H/V tag is a season-long roster designation (same level as IsZaklad), not tied to a single match.
    public MatchPlayerTag Tag { get; set; } = MatchPlayerTag.None;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
