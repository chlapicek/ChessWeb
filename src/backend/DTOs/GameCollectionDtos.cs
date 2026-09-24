namespace ChessWeb.DTOs;

public record GameCollectionSummaryDto(Guid Id, string Name, int GameCount, DateTime CreatedAt, DateTime UpdatedAt);

public record GameCollectionGameDto(Guid Id, int OrderIndex, string Pgn, string? Label);

public record GameCollectionDetailDto(Guid Id, string Name, DateTime CreatedAt, DateTime UpdatedAt, IReadOnlyList<GameCollectionGameDto> Games);

public record CreateGameCollectionGameRequest(string Pgn, string? Label);

public record CreateGameCollectionRequest(string Name, List<CreateGameCollectionGameRequest> Games);

public record UpdateGameCollectionRequest(string Name, List<CreateGameCollectionGameRequest> Games);
