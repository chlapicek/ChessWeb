using ChessWeb.Domain.Entities;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
    {
    }

    public DbSet<Article> Articles => Set<Article>();
    public DbSet<ArticleComment> ArticleComments => Set<ArticleComment>();
    public DbSet<ArticleReaction> ArticleReactions => Set<ArticleReaction>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<CalendarEvent> CalendarEvents => Set<CalendarEvent>();
    public DbSet<CalendarFeed> CalendarFeeds => Set<CalendarFeed>();
    public DbSet<Partner> Partners => Set<Partner>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<TeamMembership> TeamMemberships => Set<TeamMembership>();
    public DbSet<Competition> Competitions => Set<Competition>();
    public DbSet<TeamAvailabilityDate> TeamAvailabilityDates => Set<TeamAvailabilityDate>();
    public DbSet<TeamAvailabilityPlayer> TeamAvailabilityPlayers => Set<TeamAvailabilityPlayer>();
    public DbSet<TeamAvailabilityEntry> TeamAvailabilityEntries => Set<TeamAvailabilityEntry>();
    public DbSet<GameCollection> GameCollections => Set<GameCollection>();
    public DbSet<GameCollectionGame> GameCollectionGames => Set<GameCollectionGame>();
    public DbSet<LoggingSettings> LoggingSettings => Set<LoggingSettings>();
    public DbSet<EventSubscription> EventSubscriptions => Set<EventSubscription>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Article configuration
        builder.Entity<Article>(entity =>
        {
            entity.HasKey(a => a.Id);
            entity.Property(a => a.Title).IsRequired().HasMaxLength(250);
            entity.Property(a => a.Summary).HasMaxLength(1000);
            entity.Property(a => a.Content).IsRequired().HasMaxLength(50000);

            entity.HasOne(a => a.Author)
                  .WithMany(u => u.Articles)
                  .HasForeignKey(a => a.AuthorId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // ArticleComment configuration
        builder.Entity<ArticleComment>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Content).IsRequired().HasMaxLength(10000);

            entity.HasOne(c => c.Article)
                  .WithMany(a => a.Comments)
                  .HasForeignKey(c => c.ArticleId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(c => c.Author)
                  .WithMany(u => u.ArticleComments)
                  .HasForeignKey(c => c.AuthorId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // ArticleReaction configuration
        builder.Entity<ArticleReaction>(entity =>
        {
            entity.HasKey(r => r.Id);
            entity.HasIndex(r => new { r.ArticleId, r.UserId, r.ReactionType }).IsUnique();

            entity.HasOne(r => r.Article)
                  .WithMany(a => a.Reactions)
                  .HasForeignKey(r => r.ArticleId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(r => r.User)
                  .WithMany(u => u.ArticleReactions)
                  .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Attachment configuration
        builder.Entity<Attachment>(entity =>
        {
            entity.HasKey(a => a.Id);
            entity.Property(a => a.FileName).IsRequired().HasMaxLength(255);
            entity.Property(a => a.StoredFileName).IsRequired().HasMaxLength(255);
            entity.Property(a => a.ContentType).IsRequired().HasMaxLength(100);

            entity.HasOne(a => a.Article)
                  .WithMany(art => art.Attachments)
                  .HasForeignKey(a => a.ArticleId)
                  .OnDelete(DeleteBehavior.Cascade);

        });

        // Calendar Event configuration
        builder.Entity<CalendarEvent>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(250);
            entity.Property(e => e.Location).HasMaxLength(300);
            entity.Property(e => e.ExternalUrl).HasMaxLength(500);
            entity.Property(e => e.ExternalUid).HasMaxLength(255);
        });

        // Calendar Feed configuration
        builder.Entity<CalendarFeed>(entity =>
        {
            entity.HasKey(f => f.Id);
            entity.Property(f => f.Name).IsRequired().HasMaxLength(150);
            entity.Property(f => f.Url).IsRequired().HasMaxLength(500);
        });

        // Partner configuration
        builder.Entity<Partner>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Name).IsRequired().HasMaxLength(200);
            entity.Property(p => p.Url).IsRequired().HasMaxLength(500);
            entity.Property(p => p.LogoUrl).IsRequired().HasMaxLength(500);
            entity.Property(p => p.LogoFileName).IsRequired().HasMaxLength(255);
            entity.Property(p => p.DisplayOrder).IsRequired();
            entity.Property(p => p.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
        });

        builder.Entity<Team>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.Name).IsRequired().HasMaxLength(100);
            entity.HasIndex(t => t.Name).IsUnique();
        });

        builder.Entity<TeamMembership>(entity =>
        {
            entity.HasKey(m => new { m.TeamId, m.UserId });
            entity.HasIndex(m => m.UserId);

            entity.HasOne(m => m.Team)
                .WithMany(t => t.Memberships)
                .HasForeignKey(m => m.TeamId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(m => m.User)
                .WithMany(u => u.TeamMemberships)
                .HasForeignKey(m => m.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Team>()
            .HasOne(t => t.CaptainUser)
            .WithMany()
            .HasForeignKey(t => t.CaptainUserId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.Entity<Competition>(entity =>
        {
            entity.HasKey(c => c.Id);
            entity.Property(c => c.Name).IsRequired().HasMaxLength(200);
            entity.Property(c => c.Season).HasMaxLength(50);
            entity.Property(c => c.League).HasMaxLength(100);
            entity.Property(c => c.Venue).HasMaxLength(300);
            entity.HasOne(c => c.Team).WithMany().HasForeignKey(c => c.TeamId).OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<TeamAvailabilityEntry>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PlayerName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.OpponentTeam).IsRequired().HasMaxLength(150);
            entity.Property(e => e.Location).HasMaxLength(300);
            entity.Property(e => e.Notes).HasMaxLength(1000);
            entity.HasIndex(e => new { e.TeamId, e.MatchDate, e.RoundNumber });
            entity.HasOne(e => e.Team).WithMany().HasForeignKey(e => e.TeamId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.PlayerUser).WithMany().HasForeignKey(e => e.PlayerUserId).OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<TeamAvailabilityDate>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.OpponentTeam).HasMaxLength(150);
            entity.Property(e => e.Location).HasMaxLength(300);
            entity.HasIndex(e => new { e.TeamId, e.MatchDate }).IsUnique();
            entity.HasOne(e => e.Team).WithMany().HasForeignKey(e => e.TeamId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<TeamAvailabilityPlayer>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.PlayerName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.PlayerRating).HasMaxLength(50);
            entity.HasIndex(e => new { e.TeamId, e.PlayerUserId });
            entity.HasOne(e => e.Team).WithMany().HasForeignKey(e => e.TeamId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.PlayerUser).WithMany().HasForeignKey(e => e.PlayerUserId).OnDelete(DeleteBehavior.SetNull);
        });
        builder.Entity<GameCollection>(entity =>
        {
            entity.HasKey(g => g.Id);
            entity.Property(g => g.Name).IsRequired().HasMaxLength(200);
            entity.HasOne(g => g.CreatedByUser).WithMany().HasForeignKey(g => g.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<GameCollectionGame>(entity =>
        {
            entity.HasKey(g => g.Id);
            // No HasMaxLength: app-level validation already caps this at 15000 chars; DB column stays nvarchar(max)/TEXT to avoid exceeding SQL Server's 4000-char nvarchar(n) limit.
            entity.Property(g => g.Pgn).IsRequired();
            entity.Property(g => g.Label).HasMaxLength(200);
            entity.HasIndex(g => new { g.GameCollectionId, g.OrderIndex });
            entity.HasOne(g => g.GameCollection).WithMany(c => c.Games).HasForeignKey(g => g.GameCollectionId).OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<LoggingSettings>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.Property(s => s.MinimumLevel).IsRequired().HasMaxLength(20);
        });

        builder.Entity<ApplicationUser>().Property(u => u.Nickname).HasMaxLength(100);

        // Non-unique index for nickname lookups; uniqueness enforced in application code
        // to stay portable across SQLite/SQL Server providers.
        builder.Entity<ApplicationUser>().HasIndex(u => u.Nickname);

        builder.Entity<EventSubscription>(entity =>
        {
            entity.HasKey(s => s.Id);
            entity.HasIndex(s => new { s.UserId, s.CalendarEventId }).IsUnique();
            entity.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(s => s.Event).WithMany().HasForeignKey(s => s.CalendarEventId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
