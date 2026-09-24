using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace ChessWeb.Services;

public enum TeamMembershipResult
{
    Added,
    AlreadyAssigned,
    UserNotFound,
    TeamNotFound,
    LimitReached
}

public enum TeamCaptainAssignmentResult
{
    Success,
    TeamNotFound,
    UserNotMember
}

public interface ITeamService
{
    Task<IReadOnlyList<TeamDto>> GetTeamsAsync(CancellationToken cancellationToken);
    Task<TeamDto?> CreateTeamAsync(string name, CancellationToken cancellationToken);
    Task<IReadOnlyList<TeamPlayerDto>> SearchPlayersAsync(Guid teamId, string query, CancellationToken cancellationToken);
    Task<IReadOnlyList<ExistingPlayerDto>> SearchExistingPlayersAsync(Guid? teamId, string? query, CancellationToken cancellationToken);
    Task<TeamMembershipResult> EnsureMemberAsync(Guid teamId, Guid userId, CancellationToken cancellationToken);
    Task<TeamMembershipResult> AddMemberAsync(Guid teamId, Guid userId, CancellationToken cancellationToken);
    Task<TeamCaptainAssignmentResult> AssignCaptainAsync(Guid teamId, Guid? userId, CancellationToken cancellationToken);
    Task<bool> RemoveMemberAsync(Guid teamId, Guid userId, CancellationToken cancellationToken);
    Task<bool> DeleteTeamAsync(Guid teamId, CancellationToken cancellationToken);
}

public sealed class TeamService : ITeamService
{
    public const int MaxTeamsPerUser = 3;
    private readonly ApplicationDbContext _context;

    public TeamService(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<TeamDto>> GetTeamsAsync(CancellationToken cancellationToken)
    {
        return await _context.Teams
            .AsNoTracking()
            .OrderBy(team => team.Name)
            .Select(team => new TeamDto(
                team.Id,
                team.Name,
                team.Memberships.Count,
                team.Memberships.Select(membership => membership.UserId).ToList(),
                team.CaptainUserId,
                team.CaptainUser != null ? team.CaptainUser.FullName : null))
            .ToListAsync(cancellationToken);
    }

    public async Task<TeamDto?> CreateTeamAsync(string name, CancellationToken cancellationToken)
    {
        var normalizedName = name.Trim();
        if (normalizedName.Length is < 1 or > 100)
        {
            return null;
        }

        if (await _context.Teams.AnyAsync(team => team.Name.ToLower() == normalizedName.ToLower(), cancellationToken))
        {
            return null;
        }

        var team = new Team { Name = normalizedName };
        _context.Teams.Add(team);
        try
        {
            await _context.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.InnerException is SqlException { Number: 2601 or 2627 })
        {
            return null;
        }
        return new TeamDto(team.Id, team.Name, 0, [], null, null);
    }

    public async Task<IReadOnlyList<TeamPlayerDto>> SearchPlayersAsync(Guid teamId, string? query, CancellationToken cancellationToken)
    {
        var normalizedQuery = query?.Trim() ?? string.Empty;
        if (normalizedQuery.Length < 1)
        {
            return [];
        }

        return await _context.TeamMemberships
            .AsNoTracking()
            .Where(membership => membership.TeamId == teamId && membership.User.FullName.Contains(normalizedQuery))
            .Select(membership => new TeamPlayerDto(membership.UserId, membership.User.FullName, membership.User.ChessRating))
            .Distinct()
            .OrderBy(player => player.FullName)
            .Take(20)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<ExistingPlayerDto>> SearchExistingPlayersAsync(Guid? teamId, string? query, CancellationToken cancellationToken)
    {
        var normalizedQuery = query?.Trim() ?? string.Empty;
        if (teamId == null || normalizedQuery.Length < 1)
        {
            return [];
        }

        return await _context.Users
            .AsNoTracking()
            .Where(user => user.FullName.Contains(normalizedQuery))
            .Select(user => new ExistingPlayerDto(
                user.Id,
                user.FullName,
                user.ChessRating,
                teamId != null && user.TeamMemberships.Any(membership => membership.TeamId == teamId)))
            .OrderBy(player => player.FullName)
            .Take(20)
            .ToListAsync(cancellationToken);
    }

    public async Task<TeamMembershipResult> AddMemberAsync(Guid teamId, Guid userId, CancellationToken cancellationToken)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        var result = await EnsureMemberAsync(teamId, userId, cancellationToken);
        if (result is not TeamMembershipResult.Added and not TeamMembershipResult.AlreadyAssigned)
        {
            return result;
        }
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    public async Task<TeamCaptainAssignmentResult> AssignCaptainAsync(Guid teamId, Guid? userId, CancellationToken cancellationToken)
    {
        var team = await _context.Teams.FirstOrDefaultAsync(t => t.Id == teamId, cancellationToken);
        if (team == null)
        {
            return TeamCaptainAssignmentResult.TeamNotFound;
        }

        if (userId is Guid captainUserId && !await _context.TeamMemberships.AnyAsync(membership => membership.TeamId == teamId && membership.UserId == captainUserId, cancellationToken))
        {
            return TeamCaptainAssignmentResult.UserNotMember;
        }

        team.CaptainUserId = userId;
        await _context.SaveChangesAsync(cancellationToken);
        return TeamCaptainAssignmentResult.Success;
    }

    public async Task<TeamMembershipResult> EnsureMemberAsync(Guid teamId, Guid userId, CancellationToken cancellationToken)
    {
        if (!await _context.Teams.AnyAsync(team => team.Id == teamId, cancellationToken)) return TeamMembershipResult.TeamNotFound;
        if (!await _context.Users.AnyAsync(user => user.Id == userId, cancellationToken)) return TeamMembershipResult.UserNotFound;
        if (await _context.TeamMemberships.AnyAsync(membership => membership.TeamId == teamId && membership.UserId == userId, cancellationToken)) return TeamMembershipResult.AlreadyAssigned;
        if (await _context.TeamMemberships.CountAsync(membership => membership.UserId == userId, cancellationToken) >= MaxTeamsPerUser) return TeamMembershipResult.LimitReached;

        _context.TeamMemberships.Add(new TeamMembership { TeamId = teamId, UserId = userId });
        await _context.SaveChangesAsync(cancellationToken);
        return TeamMembershipResult.Added;
    }

    public async Task<bool> RemoveMemberAsync(Guid teamId, Guid userId, CancellationToken cancellationToken)
    {
        var membership = await _context.TeamMemberships.FindAsync([teamId, userId], cancellationToken);
        if (membership == null)
        {
            return false;
        }

        _context.TeamMemberships.Remove(membership);
        var team = await _context.Teams.FindAsync([teamId], cancellationToken);
        if (team?.CaptainUserId == userId)
        {
            team.CaptainUserId = null;
        }
        await _context.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteTeamAsync(Guid teamId, CancellationToken cancellationToken)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
        var team = await _context.Teams.FirstOrDefaultAsync(t => t.Id == teamId, cancellationToken);
        if (team == null)
        {
            return false;
        }

        var availabilityEntries = await _context.TeamAvailabilityEntries.Where(entry => entry.TeamId == teamId).ToListAsync(cancellationToken);
        _context.TeamAvailabilityEntries.RemoveRange(availabilityEntries);
        _context.Teams.Remove(team);
        await _context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }
}