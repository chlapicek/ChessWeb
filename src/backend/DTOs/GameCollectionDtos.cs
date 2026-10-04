namespace ChessWeb.DTOs;

public record GameCollectionSummaryDto(Guid Id, string Name, int GameCount, DateTime CreatedAt, DateTime UpdatedAt);

public record GameCollectionGameDto(Guid Id, int OrderIndex, string Pgn, string? Label);

public record GameCollectionDetailDto(Guid Id, string Name, DateTime CreatedAt, DateTime UpdatedAt, IReadOnlyList<GameCollectionGameDto> Games);

public interface IGameCollectionGameInput
{
    string Pgn { get; }
    string? Label { get; }
}

public record CreateGameCollectionGameRequest(string Pgn, string? Label) : IGameCollectionGameInput;

public record CreateGameCollectionRequest(string Name, List<CreateGameCollectionGameRequest> Games);

// Id refers to an existing game of the collection; omitted or unknown ids create a new game.
public record UpdateGameCollectionGameRequest(string Pgn, string? Label, Guid? Id = null) : IGameCollectionGameInput;

public record UpdateGameCollectionRequest(string Name, List<UpdateGameCollectionGameRequest> Games);
