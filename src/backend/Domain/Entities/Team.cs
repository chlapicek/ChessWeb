namespace ChessWeb.Domain.Entities;

public class Team
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Guid? CaptainUserId { get; set; }
    public ApplicationUser? CaptainUser { get; set; }
    public DateTime? SeasonStartDate { get; set; }
    public DateTime? SeasonEndDate { get; set; }

    public ICollection<TeamMembership> Memberships { get; set; } = [];
}

public class TeamMembership
{
    public Guid TeamId { get; set; }
    public Team Team { get; set; } = null!;

    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}