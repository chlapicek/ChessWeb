namespace ChessWeb.DTOs;

public record TeamDto(Guid Id, string Name, int MemberCount, IReadOnlyList<Guid> UserIds, Guid? CaptainUserId = null, string? CaptainName = null);

public record CreateTeamRequest(string Name);

public record AssignTeamCaptainRequest(Guid? CaptainUserId);
public record AssignTeamMemberRequest(Guid UserId);

public record TeamPlayerDto(Guid UserId, string FullName, string? ChessRating);

public record ExistingPlayerDto(Guid UserId, string FullName, string? ChessRating, bool IsTeamMember);

