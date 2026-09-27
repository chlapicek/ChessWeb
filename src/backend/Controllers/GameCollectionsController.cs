using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GameCollectionsController : ControllerBase
{
    private const int MaxNameLength = 200;
    private const int MaxGamesPerCollection = 100;
    private const int MaxPgnLength = 15000;

    private readonly ApplicationDbContext _context;

    public GameCollectionsController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<GameCollectionSummaryDto>>> GetCollections(CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var collections = await _context.GameCollections
            .AsNoTracking()
            .Where(c => c.CreatedByUserId == userId)
            .OrderByDescending(c => c.UpdatedAt)
            .Select(c => new GameCollectionSummaryDto(c.Id, c.Name, c.Games.Count, c.CreatedAt, c.UpdatedAt))
            .ToListAsync(cancellationToken);

        return Ok(collections);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GameCollectionDetailDto>> GetCollection(Guid id, CancellationToken cancellationToken)
    {
        var collection = await _context.GameCollections
            .AsNoTracking()
            .Include(c => c.Games)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (collection == null) return NotFound();
        if (!CanAccess(collection)) return Forbid();

        return Ok(MapToDetail(collection));
    }

    [HttpPost]
    public async Task<ActionResult<GameCollectionDetailDto>> CreateCollection(CreateGameCollectionRequest request, CancellationToken cancellationToken)
    {
        var userId = GetUserId();
        if (userId == null) return Unauthorized();

        var validationError = ValidateRequest(request.Name, request.Games);
        if (validationError != null) return BadRequest(new { message = validationError });

        var collection = new GameCollection
        {
            Name = request.Name.Trim(),
            CreatedByUserId = userId.Value,
            Games = request.Games.Select((g, index) => new GameCollectionGame
            {
                OrderIndex = index,
                Pgn = g.Pgn.Trim(),
                Label = string.IsNullOrWhiteSpace(g.Label) ? null : g.Label.Trim()
            }).ToList()
        };

        _context.GameCollections.Add(collection);
        await _context.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(nameof(GetCollection), new { id = collection.Id }, MapToDetail(collection));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<GameCollectionDetailDto>> UpdateCollection(Guid id, UpdateGameCollectionRequest request, CancellationToken cancellationToken)
    {
        var collection = await _context.GameCollections
            .Include(c => c.Games)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (collection == null) return NotFound();
        if (!CanManage(collection)) return Forbid();

        var validationError = ValidateRequest(request.Name, request.Games);
        if (validationError != null) return BadRequest(new { message = validationError });

        collection.Name = request.Name.Trim();
        var existingGames = collection.Games.ToDictionary(g => g.Id);
        var keptGameIds = new HashSet<Guid>();
        for (var index = 0; index < request.Games.Count; index++)
        {
            var game = request.Games[index];
            var pgn = game.Pgn.Trim();
            var label = string.IsNullOrWhiteSpace(game.Label) ? null : game.Label.Trim();
            if (game.Id is Guid gameId && existingGames.TryGetValue(gameId, out var existing) && keptGameIds.Add(gameId))
            {
                existing.OrderIndex = index;
                existing.Pgn = pgn;
                existing.Label = label;
                continue;
            }

            _context.GameCollectionGames.Add(new GameCollectionGame
            {
                GameCollectionId = collection.Id,
                OrderIndex = index,
                Pgn = pgn,
                Label = label
            });
        }
        _context.GameCollectionGames.RemoveRange(existingGames.Values.Where(g => !keptGameIds.Contains(g.Id)));
        collection.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);

        var refreshedCollection = await _context.GameCollections
            .AsNoTracking()
            .Include(c => c.Games)
            .FirstAsync(c => c.Id == collection.Id, cancellationToken);

        return Ok(MapToDetail(refreshedCollection));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteCollection(Guid id, CancellationToken cancellationToken)
    {
        var collection = await _context.GameCollections.FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
        if (collection == null) return NotFound();
        if (!CanManage(collection)) return Forbid();

        var linkedArticles = await _context.Articles.Where(a => a.GameCollectionId == id).ToListAsync(cancellationToken);
        foreach (var article in linkedArticles)
        {
            article.GameCollectionId = null;
        }
        _context.GameCollections.Remove(collection);
        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("{id:guid}/export")]
    public async Task<IActionResult> ExportCollection(Guid id, CancellationToken cancellationToken)
    {
        var collection = await _context.GameCollections
            .AsNoTracking()
            .Include(c => c.Games)
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);

        if (collection == null) return NotFound();
        if (!CanAccess(collection)) return Forbid();

        var pgnText = string.Join("\n\n", collection.Games.OrderBy(g => g.OrderIndex).Select(g => g.Pgn.Trim()));
        var bytes = Encoding.UTF8.GetBytes(pgnText);
        var fileName = SanitizeFileName(collection.Name) + ".pgn";

        return File(bytes, "application/x-chess-pgn", fileName);
    }

    private static string? ValidateRequest(string name, IReadOnlyCollection<IGameCollectionGameInput>? games)
    {
        if (string.IsNullOrWhiteSpace(name)) return "Collection name is required.";
        if (name.Trim().Length > MaxNameLength) return $"Collection name cannot exceed {MaxNameLength} characters.";
        if (games == null || games.Count == 0) return "A collection must contain at least one game.";
        if (games.Count > MaxGamesPerCollection) return $"A collection cannot contain more than {MaxGamesPerCollection} games.";
        foreach (var game in games)
        {
            if (string.IsNullOrWhiteSpace(game.Pgn)) return "Every game must contain PGN text.";
            if (game.Pgn.Length > MaxPgnLength) return $"PGN data cannot exceed {MaxPgnLength} characters.";
            if (game.Label != null && game.Label.Length > MaxNameLength) return $"Game label cannot exceed {MaxNameLength} characters.";
        }
        return null;
    }

    private static string SanitizeFileName(string name)
    {
        var sanitized = Regex.Replace(name, "[^a-zA-Z0-9-_ ]", "").Trim();
        if (string.IsNullOrWhiteSpace(sanitized)) sanitized = "game-collection";
        return sanitized;
    }

    private static GameCollectionDetailDto MapToDetail(GameCollection collection) => new(
        collection.Id,
        collection.Name,
        collection.CreatedAt,
        collection.UpdatedAt,
        collection.Games.OrderBy(g => g.OrderIndex).Select(g => new GameCollectionGameDto(g.Id, g.OrderIndex, g.Pgn, g.Label)).ToList());

    private bool CanAccess(GameCollection collection) => collection.CreatedByUserId == GetUserId() || User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin);

    private bool CanManage(GameCollection collection) => CanAccess(collection);

    private Guid? GetUserId() => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}
