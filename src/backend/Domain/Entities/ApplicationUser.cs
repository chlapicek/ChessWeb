using Microsoft.AspNetCore.Identity;

namespace ChessWeb.Domain.Entities;

public class ApplicationUser : IdentityUser<Guid>
{
    public string FullName { get; set; } = string.Empty;
    public string? Nickname { get; set; }
    public string? ChessRating { get; set; }
    public string? FideId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastActiveAt { get; set; }

    public ICollection<Article> Articles { get; set; } = [];
    public ICollection<ArticleComment> ArticleComments { get; set; } = [];
    public ICollection<ArticleReaction> ArticleReactions { get; set; } = [];
    public ICollection<TeamMembership> TeamMemberships { get; set; } = [];
}

public class ApplicationRole : IdentityRole<Guid>
{
    public ApplicationRole() : base() { }
    public ApplicationRole(string roleName) : base(roleName) { }
    public string Description { get; set; } = string.Empty;
}
