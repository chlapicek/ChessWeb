using ChessWeb.Domain.Entities;

namespace ChessWeb.DTOs;

public record TeamAvailabilityTeamDto(
    Guid Id,
    string Name,
    int MemberCount,
    Guid? CaptainUserId,
    string? CaptainName
);

public record TeamAvailabilityDto(
    Guid TeamId,
    string TeamName,
    IReadOnlyList<TeamMemberDto> TeamMembers,
    Guid? CaptainUserId,
    string? CaptainName,
    DateTime? SeasonStartDate,
    DateTime? SeasonEndDate,
    IReadOnlyList<TeamAvailabilityDateDto> Dates,
    IReadOnlyList<TeamAvailabilityPlayerDto> Players,
    IReadOnlyList<TeamAvailabilityEntryDto> Entries
);

public record TeamMemberDto(Guid UserId, string FullName, string? ChessRating);

public record TeamAvailabilityDateDto(
    Guid Id,
    Guid TeamId,
    int RoundNumber,
    DateTime MatchDate,
    string OpponentTeam,
    string Location,
    bool IsHomeMatch,
    bool IsClosed
);

public record TeamAvailabilityPlayerDto(
    Guid Id,
    Guid TeamId,
    Guid? PlayerUserId,
    string PlayerName,
    string? PlayerRating,
    bool IsZaklad,
    MatchPlayerTag Tag
);

public record TeamAvailabilityEntryDto(
    Guid Id,
    Guid TeamId,
    Guid? PlayerUserId,
    string PlayerName,
    string? PlayerRating,
    int RoundNumber,
    DateTime MatchDate,
    string OpponentTeam,
    string Location,
    bool IsHomeMatch,
    AvailabilityStatus Status,
    bool IsDriver,
    string? Notes,
    DateTime UpdatedAt
);

public record UpsertTeamAvailabilityEntryRequest(
    Guid? PlayerUserId,
    string PlayerName,
    string? PlayerRating,
    int RoundNumber,
    DateTime MatchDate,
    string OpponentTeam,
    string Location,
    bool IsHomeMatch,
    AvailabilityStatus Status,
    bool IsDriver,
    string? Notes
);

public record AddTeamAvailabilityDateRequest(
    DateTime MatchDate,
    string? OpponentTeam,
    string? Location,
    bool IsHomeMatch
);

public record AddTeamAvailabilityPlayerRequest(
    Guid? PlayerUserId,
    string? PlayerName,
    bool IsZaklad = false,
    MatchPlayerTag Tag = MatchPlayerTag.None
);

public record UpdateOwnTeamAvailabilityRequest(AvailabilityStatus Status, bool IsDriver, string? Notes);
public record UpdateZakladRequest(bool IsZaklad);
public record UpdateTagRequest(MatchPlayerTag Tag);
public record UpdateTeamSeasonRequest(DateTime? SeasonStartDate, DateTime? SeasonEndDate);
public record SeasonReportEntryDto(Guid PlayerId, string PlayerName, int MatchesPlayed, bool MeetsMinimum);
