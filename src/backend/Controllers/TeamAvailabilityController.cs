using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using ChessWeb.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Data;
using System.Security.Claims;

namespace ChessWeb.Controllers;

[ApiController]
[Route("api/teamavailability")]
[Authorize]
public class TeamAvailabilityController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ITeamService _teamService;
    private readonly TimeProvider _timeProvider;

    public TeamAvailabilityController(ApplicationDbContext context, ITeamService teamService, TimeProvider timeProvider)
    {
        _context = context;
        _teamService = teamService;
        _timeProvider = timeProvider;
    }

    [HttpGet("teams")]
    public async Task<ActionResult<IReadOnlyList<TeamAvailabilityTeamDto>>> GetTeams(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        var query = _context.Teams.AsNoTracking().Where(t => User.IsInRole(Roles.Admin) || t.Memberships.Any(m => m.UserId == userId));
        return Ok(await query.OrderBy(t => t.Name).Select(t => new TeamAvailabilityTeamDto(t.Id, t.Name, t.Memberships.Count, t.CaptainUserId, t.CaptainUser!.FullName)).ToListAsync(cancellationToken));
    }

    [HttpGet("team/{teamId:guid}")]
    public async Task<ActionResult<TeamAvailabilityDto>> GetForTeam(Guid teamId, CancellationToken cancellationToken)
    {
        var team = await _context.Teams.Include(t => t.Memberships).ThenInclude(m => m.User).Include(t => t.CaptainUser).AsNoTracking().FirstOrDefaultAsync(t => t.Id == teamId, cancellationToken);
        if (team == null) return NotFound();
        if (!await CanViewAsync(teamId)) return Forbid();
        await EnsureAvailabilityMatrixAsync(teamId, cancellationToken);
        var entries = await _context.TeamAvailabilityEntries.AsNoTracking().Where(e => e.TeamId == teamId).OrderBy(e => e.MatchDate).ThenBy(e => e.PlayerName).ToListAsync(cancellationToken);
        var storedDates = await _context.TeamAvailabilityDates.AsNoTracking().Where(e => e.TeamId == teamId).OrderBy(e => e.MatchDate).ThenBy(e => e.RoundNumber).ToListAsync(cancellationToken);
        var storedPlayers = await _context.TeamAvailabilityPlayers.AsNoTracking().Where(e => e.TeamId == teamId).OrderBy(e => e.PlayerName).ToListAsync(cancellationToken);
        var dates = storedDates.Select(MapDate).Concat(entries.GroupBy(e => new { Date = e.MatchDate.Date, e.RoundNumber, e.OpponentTeam, e.Location, e.IsHomeMatch }).Where(group => storedDates.All(date => date.MatchDate.Date != group.Key.Date)).Select(group => new TeamAvailabilityDateDto(Guid.Empty, team.Id, group.Key.RoundNumber, group.Key.Date, group.Key.OpponentTeam, group.Key.Location, group.Key.IsHomeMatch, IsAvailabilityClosed(group.Key.Date)))).OrderBy(e => e.MatchDate).ThenBy(e => e.RoundNumber).ToList();
        var players = storedPlayers.Select(MapPlayer).Concat(entries.GroupBy(e => PlayerKey(new AvailabilityPlayer(e.PlayerUserId, e.PlayerName, e.PlayerRating))).Where(group => storedPlayers.All(player => PlayerKey(new AvailabilityPlayer(player.PlayerUserId, player.PlayerName, player.PlayerRating)) != group.Key)).Select(group => group.First()).Select(e => new TeamAvailabilityPlayerDto(Guid.Empty, team.Id, e.PlayerUserId, e.PlayerName, e.PlayerRating, false, MatchPlayerTag.None))).OrderBy(e => e.PlayerName).ToList();
        var members = team.Memberships.Select(m => new TeamMemberDto(m.UserId, m.User.FullName, m.User.ChessRating)).OrderBy(m => m.FullName).ToList();
        return Ok(new TeamAvailabilityDto(team.Id, team.Name, members, team.CaptainUserId, team.CaptainUser?.FullName, team.SeasonStartDate, team.SeasonEndDate, dates, players, entries.Select(MapEntry).ToList()));
    }

    [HttpGet("players")]
    public async Task<ActionResult<IReadOnlyList<ExistingPlayerDto>>> SearchPlayers([FromQuery] Guid? teamId, [FromQuery] string? query, CancellationToken cancellationToken)
    {
        if (teamId == null || string.IsNullOrWhiteSpace(query) || query.Trim().Length < 1) return Ok(Array.Empty<ExistingPlayerDto>());
        if (!await _context.Teams.AnyAsync(t => t.Id == teamId, cancellationToken)) return NotFound();
        if (!await CanViewAsync(teamId.Value)) return Forbid();
        var normalized = query.Trim();
        var canManage = await CanManageAsync(teamId.Value);
        return Ok(await _context.Users.AsNoTracking().Where(u => u.FullName.Contains(normalized) && (canManage || u.TeamMemberships.Any(m => m.TeamId == teamId))).OrderBy(u => u.FullName).Select(u => new ExistingPlayerDto(u.Id, u.FullName, u.ChessRating, u.TeamMemberships.Any(m => m.TeamId == teamId))).Take(20).ToListAsync(cancellationToken));
    }

    [HttpPost("team/{teamId:guid}/entries")]
    public async Task<ActionResult<TeamAvailabilityEntryDto>> CreateEntry(Guid teamId, UpsertTeamAvailabilityEntryRequest request, CancellationToken cancellationToken)
    {
        if (!await _context.Teams.AnyAsync(t => t.Id == teamId, cancellationToken)) return NotFound();
        if (!await CanManageAsync(teamId)) return Forbid();
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var error = await ValidateRequestAsync(teamId, request, cancellationToken);
        if (error != null) return BadRequest(new { message = error });
        var entry = new TeamAvailabilityEntry { TeamId = teamId, PlayerUserId = request.PlayerUserId, PlayerName = request.PlayerName.Trim(), PlayerRating = request.PlayerRating, RoundNumber = request.RoundNumber, MatchDate = request.MatchDate, OpponentTeam = request.OpponentTeam.Trim(), Location = request.Location.Trim(), IsHomeMatch = request.IsHomeMatch, Status = request.Status, IsDriver = request.IsDriver, Notes = request.Notes?.Trim() };
        await EnsureDateAxisAsync(entry, cancellationToken);
        await EnsurePlayerAxisAsync(entry, cancellationToken);
        _context.TeamAvailabilityEntries.Add(entry);
        await _context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return CreatedAtAction(nameof(GetForTeam), new { teamId }, MapEntry(entry));
    }

    [HttpPost("team/{teamId:guid}/dates")]
    public async Task<ActionResult<TeamAvailabilityDateDto>> AddDate(Guid teamId, AddTeamAvailabilityDateRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var team = await _context.Teams.Include(t => t.Memberships).ThenInclude(m => m.User).AsNoTracking().FirstOrDefaultAsync(t => t.Id == teamId, cancellationToken);
        if (team == null) return NotFound();
        if (!await CanManageAsync(teamId)) return Forbid();
        if (request.MatchDate == default || (request.OpponentTeam?.Length ?? 0) > 150 || (request.Location?.Length ?? 0) > 300) return BadRequest(new { message = "Match date is invalid." });

        var matchDate = request.MatchDate.Date;
        var existingDates = await _context.TeamAvailabilityDates.Where(e => e.TeamId == teamId).ToListAsync(cancellationToken);
        var existingEntries = await _context.TeamAvailabilityEntries.Where(e => e.TeamId == teamId).ToListAsync(cancellationToken);
        if (existingDates.Any(e => e.MatchDate.Date == matchDate)) return BadRequest(new { message = "This match date already exists." });
        if (existingEntries.Any(e => e.MatchDate.Date == matchDate)) return BadRequest(new { message = "This match date already exists." });

        var currentMemberIds = team.Memberships.Select(m => m.UserId).ToHashSet();
        var players = await _context.TeamAvailabilityPlayers.Where(e => e.TeamId == teamId && (e.PlayerUserId == null || currentMemberIds.Contains(e.PlayerUserId.Value))).OrderBy(e => e.PlayerName).ToListAsync(cancellationToken);

        var roundNumber = existingDates.Count == 0 && existingEntries.Count == 0 ? 1 : Math.Max(existingDates.Count == 0 ? 0 : existingDates.Max(e => e.RoundNumber), existingEntries.Count == 0 ? 0 : existingEntries.Max(e => e.RoundNumber)) + 1;
        var date = new TeamAvailabilityDate { TeamId = teamId, RoundNumber = roundNumber, MatchDate = matchDate, OpponentTeam = request.OpponentTeam?.Trim() ?? string.Empty, Location = request.Location?.Trim() ?? string.Empty, IsHomeMatch = request.IsHomeMatch };
        var entries = players.Select(player => new TeamAvailabilityEntry { TeamId = teamId, PlayerUserId = player.PlayerUserId, PlayerName = player.PlayerName.Trim(), PlayerRating = player.PlayerRating, RoundNumber = roundNumber, MatchDate = matchDate, OpponentTeam = date.OpponentTeam, Location = date.Location, IsHomeMatch = date.IsHomeMatch, Status = AvailabilityStatus.Pending }).ToList();
        _context.TeamAvailabilityDates.Add(date);
        _context.TeamAvailabilityEntries.AddRange(entries);
        await _context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return CreatedAtAction(nameof(GetForTeam), new { teamId }, MapDate(date));
    }

    [HttpPost("team/{teamId:guid}/players")]
    public async Task<ActionResult<TeamAvailabilityPlayerDto>> AddPlayer(Guid teamId, AddTeamAvailabilityPlayerRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        if (!await _context.Teams.AnyAsync(t => t.Id == teamId, cancellationToken)) return NotFound();
        if (!await CanManageAsync(teamId)) return Forbid();

        AvailabilityPlayer player;
        if (request.PlayerUserId is Guid playerUserId)
        {
            var registeredUser = await _context.Users.AsNoTracking().FirstOrDefaultAsync(user => user.Id == playerUserId, cancellationToken);
            if (registeredUser == null) return BadRequest(new { message = "Registered player was not found." });
            player = new AvailabilityPlayer(registeredUser.Id, registeredUser.FullName, registeredUser.ChessRating);
        }
        else
        {
            if (string.IsNullOrWhiteSpace(request.PlayerName) || request.PlayerName.Length > 150) return BadRequest(new { message = "Player name is required and must be 150 characters or fewer." });
            player = new AvailabilityPlayer(null, request.PlayerName.Trim(), null);
            if (await _context.TeamMemberships.Include(m => m.User).AsNoTracking().AnyAsync(m => m.TeamId == teamId && m.User.FullName.ToUpper() == player.PlayerName.ToUpperInvariant(), cancellationToken)) return BadRequest(new { message = "This player already exists in availability." });
        }

        var tagError = await ValidateTagAsync(teamId, request.Tag, null, cancellationToken);
        if (tagError != null) return BadRequest(new { message = tagError });

        var existingPlayers = await _context.TeamAvailabilityPlayers.Where(e => e.TeamId == teamId).ToListAsync(cancellationToken);
        var existingEntries = await _context.TeamAvailabilityEntries.Where(e => e.TeamId == teamId).ToListAsync(cancellationToken);
        if (existingPlayers.Any(e => PlayerKey(new AvailabilityPlayer(e.PlayerUserId, e.PlayerName, e.PlayerRating)) == PlayerKey(player) || e.PlayerName.Equals(player.PlayerName, StringComparison.OrdinalIgnoreCase))) return BadRequest(new { message = "This player already exists in availability." });
        if (existingEntries.Any(e => PlayerKey(new AvailabilityPlayer(e.PlayerUserId, e.PlayerName, e.PlayerRating)) == PlayerKey(player) || e.PlayerName.Equals(player.PlayerName, StringComparison.OrdinalIgnoreCase))) return BadRequest(new { message = "This player already exists in availability." });

        if (request.PlayerUserId is Guid selectedUserId)
        {
            var membershipResult = await _teamService.EnsureMemberAsync(teamId, selectedUserId, cancellationToken);
            if (membershipResult == TeamMembershipResult.TeamNotFound) return NotFound();
            if (membershipResult == TeamMembershipResult.LimitReached) return BadRequest(new { message = "A user can belong to at most 3 teams." });
            if (membershipResult == TeamMembershipResult.UserNotFound) return BadRequest(new { message = "Registered player was not found." });
        }

        var dates = await _context.TeamAvailabilityDates.Where(e => e.TeamId == teamId).OrderBy(e => e.MatchDate).ThenBy(e => e.RoundNumber).ToListAsync(cancellationToken);
        var entries = dates.Select(date => new TeamAvailabilityEntry { TeamId = teamId, PlayerUserId = player.PlayerUserId, PlayerName = player.PlayerName.Trim(), PlayerRating = player.PlayerRating, RoundNumber = date.RoundNumber, MatchDate = date.MatchDate.Date, OpponentTeam = date.OpponentTeam, Location = date.Location, IsHomeMatch = date.IsHomeMatch, Status = AvailabilityStatus.Pending }).ToList();
        var availabilityPlayer = new TeamAvailabilityPlayer { TeamId = teamId, PlayerUserId = player.PlayerUserId, PlayerName = player.PlayerName.Trim(), PlayerRating = player.PlayerRating, IsZaklad = request.IsZaklad, Tag = request.Tag };
        _context.TeamAvailabilityPlayers.Add(availabilityPlayer);
        _context.TeamAvailabilityEntries.AddRange(entries);
        await _context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return CreatedAtAction(nameof(GetForTeam), new { teamId }, MapPlayer(availabilityPlayer));
    }

    [HttpPut("entries/{entryId:guid}/self")]
    public async Task<IActionResult> UpdateOwnEntry(Guid entryId, UpdateOwnTeamAvailabilityRequest request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        var entry = await _context.TeamAvailabilityEntries.FirstOrDefaultAsync(e => e.Id == entryId, cancellationToken);
        if (entry == null) return NotFound();
        if (entry.PlayerUserId != userId) return Forbid();
        if (!await _context.TeamMemberships.AnyAsync(m => m.TeamId == entry.TeamId && m.UserId == userId, cancellationToken)) return Forbid();
        if (IsAvailabilityClosed(entry)) return BadRequest(new { message = "Availability is closed for this match date." });
        if (!Enum.IsDefined(request.Status) || request.Notes?.Length > 1000) return BadRequest(new { message = "Availability update is invalid." });
        entry.Status = request.Status; entry.IsDriver = request.IsDriver; entry.Notes = request.Notes?.Trim(); entry.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("entries/{entryId:guid}")]
    public async Task<IActionResult> UpdateEntry(Guid entryId, UpsertTeamAvailabilityEntryRequest request, CancellationToken cancellationToken)
    {
        var entry = await _context.TeamAvailabilityEntries.FirstOrDefaultAsync(e => e.Id == entryId, cancellationToken);
        if (entry == null) return NotFound();
        if (!await CanManageAsync(entry.TeamId)) return Forbid();
        if (IsAvailabilityClosed(entry)) return BadRequest(new { message = "Availability is closed for this match date." });
        if (!Enum.IsDefined(request.Status) || request.Notes?.Length > 1000) return BadRequest(new { message = "Availability update is invalid." });
        entry.Status = request.Status; entry.IsDriver = request.IsDriver; entry.Notes = request.Notes?.Trim(); entry.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpDelete("entries/{entryId:guid}")]
    public async Task<IActionResult> DeleteEntry(Guid entryId, CancellationToken cancellationToken)
    {
        var entry = await _context.TeamAvailabilityEntries.FirstOrDefaultAsync(e => e.Id == entryId, cancellationToken);
        if (entry == null) return NotFound();
        if (!await CanManageAsync(entry.TeamId)) return Forbid();
        _context.TeamAvailabilityEntries.Remove(entry);
        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("team/{teamId:guid}/captain")]
    public async Task<IActionResult> AssignCaptain(Guid teamId, AssignTeamCaptainRequest request, CancellationToken cancellationToken)
    {
        if (!User.IsInRole(Roles.Admin)) return Forbid();
        var result = await _teamService.AssignCaptainAsync(teamId, request.CaptainUserId, cancellationToken);
        return result switch
        {
            TeamCaptainAssignmentResult.Success => NoContent(),
            TeamCaptainAssignmentResult.TeamNotFound => NotFound(),
            TeamCaptainAssignmentResult.UserNotMember => BadRequest(new { message = "Captain must be a member of the team." }),
            _ => BadRequest()
        };
    }

    [HttpPut("team/{teamId:guid}/players/{playerId:guid}/zaklad")]
    public async Task<IActionResult> UpdateZaklad(Guid teamId, Guid playerId, UpdateZakladRequest request, CancellationToken cancellationToken)
    {
        if (!await _context.Teams.AnyAsync(t => t.Id == teamId, cancellationToken)) return NotFound();
        if (!await CanManageAsync(teamId)) return Forbid();
        var player = await _context.TeamAvailabilityPlayers.FirstOrDefaultAsync(p => p.Id == playerId && p.TeamId == teamId, cancellationToken);
        if (player == null) return NotFound();
        player.IsZaklad = request.IsZaklad;
        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("team/{teamId:guid}/players/{playerId:guid}/tag")]
    public async Task<IActionResult> UpdatePlayerTag(Guid teamId, Guid playerId, UpdateTagRequest request, CancellationToken cancellationToken)
    {
        if (!await _context.Teams.AnyAsync(t => t.Id == teamId, cancellationToken)) return NotFound();
        if (!await CanManageAsync(teamId)) return Forbid();
        var player = await _context.TeamAvailabilityPlayers.FirstOrDefaultAsync(p => p.Id == playerId && p.TeamId == teamId, cancellationToken);
        if (player == null) return NotFound();
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var tagError = await ValidateTagAsync(teamId, request.Tag, playerId, cancellationToken);
        if (tagError != null) return BadRequest(new { message = tagError });
        player.Tag = request.Tag;
        await _context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("team/{teamId:guid}/season")]
    public async Task<IActionResult> UpdateSeason(Guid teamId, UpdateTeamSeasonRequest request, CancellationToken cancellationToken)
    {
        var team = await _context.Teams.FindAsync([teamId], cancellationToken);
        if (team == null) return NotFound();
        if (!await CanManageAsync(teamId)) return Forbid();
        if (request.SeasonStartDate != null && request.SeasonEndDate != null && request.SeasonStartDate > request.SeasonEndDate) return BadRequest(new { message = "Season start date must not be after the season end date." });
        team.SeasonStartDate = request.SeasonStartDate;
        team.SeasonEndDate = request.SeasonEndDate;
        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("team/{teamId:guid}/season-report")]
    public async Task<ActionResult<IReadOnlyList<SeasonReportEntryDto>>> GetSeasonReport(Guid teamId, CancellationToken cancellationToken)
    {
        var team = await _context.Teams.AsNoTracking().FirstOrDefaultAsync(t => t.Id == teamId, cancellationToken);
        if (team == null) return NotFound();
        if (!await CanViewAsync(teamId)) return Forbid();
        var zakladPlayers = await _context.TeamAvailabilityPlayers.AsNoTracking().Where(p => p.TeamId == teamId && p.IsZaklad).ToListAsync(cancellationToken);
        var availableEntries = await _context.TeamAvailabilityEntries.AsNoTracking().Where(e => e.TeamId == teamId && e.Status == AvailabilityStatus.Available).ToListAsync(cancellationToken);
        var report = zakladPlayers.Select(player =>
        {
            var key = PlayerKey(new AvailabilityPlayer(player.PlayerUserId, player.PlayerName, player.PlayerRating));
            var matchesPlayed = availableEntries.Count(entry =>
                PlayerKey(new AvailabilityPlayer(entry.PlayerUserId, entry.PlayerName, entry.PlayerRating)) == key &&
                (team.SeasonStartDate == null || entry.MatchDate.Date >= team.SeasonStartDate.Value.Date) &&
                (team.SeasonEndDate == null || entry.MatchDate.Date <= team.SeasonEndDate.Value.Date));
            return new SeasonReportEntryDto(player.Id, player.PlayerName, matchesPlayed, matchesPlayed >= 2);
        }).OrderBy(entry => entry.PlayerName).ToList();
        return Ok(report);
    }

    private async Task<bool> CanViewAsync(Guid teamId) => User.IsInRole(Roles.Admin) || (GetUserId() is Guid userId && await _context.TeamMemberships.AnyAsync(m => m.TeamId == teamId && m.UserId == userId, HttpContext.RequestAborted));
    private async Task<bool> CanManageAsync(Guid teamId) => User.IsInRole(Roles.Admin) || (GetUserId() is Guid userId && await _context.Teams.AnyAsync(t => t.Id == teamId && t.CaptainUserId == userId, HttpContext.RequestAborted));

    private async Task<string?> ValidateRequestAsync(Guid teamId, UpsertTeamAvailabilityEntryRequest request, CancellationToken cancellationToken, Guid? existingEntryId = null)
    {
        if (string.IsNullOrWhiteSpace(request.PlayerName) || request.PlayerName.Length > 150) return "Player name is required and must be 150 characters or fewer.";
        if (string.IsNullOrWhiteSpace(request.OpponentTeam) || request.OpponentTeam.Length > 150) return "Opponent team is required and must be 150 characters or fewer.";
        if ((request.Location?.Length ?? 0) > 300 || (request.Notes?.Length ?? 0) > 1000 || (request.PlayerRating?.Length ?? 0) > 50) return "One or more fields exceed their maximum length.";
        if (request.RoundNumber < 1 || !Enum.IsDefined(request.Status)) return "Round and status are invalid.";
        if (request.PlayerUserId != null && !await _context.TeamMemberships.AnyAsync(m => m.TeamId == teamId && m.UserId == request.PlayerUserId, cancellationToken)) return "Registered player must belong to the team.";
        var matchDate = request.MatchDate.Date;
        var playerName = request.PlayerName.Trim();
        var duplicateExists = await _context.TeamAvailabilityEntries.AnyAsync(e => e.TeamId == teamId && e.Id != existingEntryId && e.MatchDate.Date == matchDate && (request.PlayerUserId != null ? e.PlayerUserId == request.PlayerUserId : e.PlayerUserId == null && e.PlayerName.ToUpper() == playerName.ToUpperInvariant()), cancellationToken);
        if (duplicateExists) return "This availability cell already exists.";
        return null;
    }

    private Guid? GetUserId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    private sealed record AvailabilityPlayer(Guid? PlayerUserId, string PlayerName, string? PlayerRating);
    private static string PlayerKey(AvailabilityPlayer player) => player.PlayerUserId?.ToString("N") ?? player.PlayerName.Trim().ToUpperInvariant();
    private bool IsAvailabilityClosed(TeamAvailabilityEntry entry) => IsAvailabilityClosed(entry.MatchDate);
    private bool IsAvailabilityClosed(DateTime matchDate) => matchDate.Date < _timeProvider.GetLocalNow().Date;

    private async Task<string?> ValidateTagAsync(Guid teamId, MatchPlayerTag tag, Guid? excludePlayerId, CancellationToken cancellationToken)
    {
        if (tag == MatchPlayerTag.None) return null;
        if (!Enum.IsDefined(tag)) return "Player tag is invalid.";
        var taggedCount = await _context.TeamAvailabilityPlayers.CountAsync(p => p.TeamId == teamId && p.Tag != MatchPlayerTag.None && p.Id != excludePlayerId, cancellationToken);
        return taggedCount >= 3 ? "Maximum of 3 tagged players (Cizinec/Host/Vy\u0161\u0161\u00ed) per team for the season." : null;
    }
    private async Task EnsureDateAxisAsync(TeamAvailabilityEntry entry, CancellationToken cancellationToken)
    {
        if (await _context.TeamAvailabilityDates.AnyAsync(e => e.TeamId == entry.TeamId && e.MatchDate.Date == entry.MatchDate.Date, cancellationToken)) return;
        _context.TeamAvailabilityDates.Add(new TeamAvailabilityDate { TeamId = entry.TeamId, RoundNumber = entry.RoundNumber, MatchDate = entry.MatchDate.Date, OpponentTeam = entry.OpponentTeam, Location = entry.Location, IsHomeMatch = entry.IsHomeMatch });
    }

    private async Task EnsurePlayerAxisAsync(TeamAvailabilityEntry entry, CancellationToken cancellationToken)
    {
        var player = new AvailabilityPlayer(entry.PlayerUserId, entry.PlayerName, entry.PlayerRating);
        if (await _context.TeamAvailabilityPlayers.AnyAsync(e => e.TeamId == entry.TeamId && (entry.PlayerUserId != null ? e.PlayerUserId == entry.PlayerUserId : e.PlayerUserId == null && e.PlayerName.ToUpper() == player.PlayerName.ToUpperInvariant()), cancellationToken)) return;
        _context.TeamAvailabilityPlayers.Add(new TeamAvailabilityPlayer { TeamId = entry.TeamId, PlayerUserId = entry.PlayerUserId, PlayerName = entry.PlayerName, PlayerRating = entry.PlayerRating });
    }

    private async Task EnsureAvailabilityMatrixAsync(Guid teamId, CancellationToken cancellationToken)
    {
        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var currentMemberIdSet = (await _context.TeamMemberships.Where(m => m.TeamId == teamId).Select(m => m.UserId).ToListAsync(cancellationToken)).ToHashSet();
        var dates = await _context.TeamAvailabilityDates.Where(e => e.TeamId == teamId).ToListAsync(cancellationToken);
        var players = await _context.TeamAvailabilityPlayers.Where(e => e.TeamId == teamId).ToListAsync(cancellationToken);
        var entries = await _context.TeamAvailabilityEntries.Where(e => e.TeamId == teamId).ToListAsync(cancellationToken);

        foreach (var entry in entries)
        {
            if (dates.All(date => date.MatchDate.Date != entry.MatchDate.Date))
            {
                var date = new TeamAvailabilityDate { TeamId = teamId, RoundNumber = entry.RoundNumber, MatchDate = entry.MatchDate.Date, OpponentTeam = entry.OpponentTeam, Location = entry.Location, IsHomeMatch = entry.IsHomeMatch };
                dates.Add(date);
                _context.TeamAvailabilityDates.Add(date);
            }

            var entryPlayer = new AvailabilityPlayer(entry.PlayerUserId, entry.PlayerName, entry.PlayerRating);
            if (players.All(player => PlayerKey(new AvailabilityPlayer(player.PlayerUserId, player.PlayerName, player.PlayerRating)) != PlayerKey(entryPlayer)))
            {
                var player = new TeamAvailabilityPlayer { TeamId = teamId, PlayerUserId = entry.PlayerUserId, PlayerName = entry.PlayerName, PlayerRating = entry.PlayerRating };
                players.Add(player);
                _context.TeamAvailabilityPlayers.Add(player);
            }
        }

        var activePlayers = players.Where(player => player.PlayerUserId == null || currentMemberIdSet.Contains(player.PlayerUserId.Value)).ToList();
        foreach (var date in dates)
        {
            foreach (var player in activePlayers)
            {
                var availabilityPlayer = new AvailabilityPlayer(player.PlayerUserId, player.PlayerName, player.PlayerRating);
                if (entries.Any(entry => entry.MatchDate.Date == date.MatchDate.Date && PlayerKey(new AvailabilityPlayer(entry.PlayerUserId, entry.PlayerName, entry.PlayerRating)) == PlayerKey(availabilityPlayer))) continue;

                var entry = new TeamAvailabilityEntry { TeamId = teamId, PlayerUserId = player.PlayerUserId, PlayerName = player.PlayerName.Trim(), PlayerRating = player.PlayerRating, RoundNumber = date.RoundNumber, MatchDate = date.MatchDate.Date, OpponentTeam = date.OpponentTeam, Location = date.Location, IsHomeMatch = date.IsHomeMatch, Status = AvailabilityStatus.Pending };
                entries.Add(entry);
                _context.TeamAvailabilityEntries.Add(entry);
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private TeamAvailabilityDateDto MapDate(TeamAvailabilityDate e) => new(e.Id, e.TeamId, e.RoundNumber, e.MatchDate, e.OpponentTeam, e.Location, e.IsHomeMatch, IsAvailabilityClosed(e.MatchDate));
    private static TeamAvailabilityPlayerDto MapPlayer(TeamAvailabilityPlayer e) => new(e.Id, e.TeamId, e.PlayerUserId, e.PlayerName, e.PlayerRating, e.IsZaklad, e.Tag);
    private static TeamAvailabilityEntryDto MapEntry(TeamAvailabilityEntry e) => new(e.Id, e.TeamId, e.PlayerUserId, e.PlayerName, e.PlayerRating, e.RoundNumber, e.MatchDate, e.OpponentTeam, e.Location, e.IsHomeMatch, e.Status, e.IsDriver, e.Notes, e.UpdatedAt);
}
