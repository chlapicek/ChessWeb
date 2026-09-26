using System.Security.Claims;
using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using ChessWeb.Services;
using ChessWeb.Validators;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ArticlesController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IFileStorageService _fileStorage;
    private readonly ILogger<ArticlesController> _logger;

    public ArticlesController(
        ApplicationDbContext context,
        IFileStorageService fileStorage,
        ILogger<ArticlesController> logger)
    {
        _context = context;
        _fileStorage = fileStorage;
        _logger = logger;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<PagedResult<ArticleDto>>> GetArticles(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 50);

        Guid? currentUserId = null;
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(userIdStr, out var parsedId))
        {
            currentUserId = parsedId;
        }

        var query = _context.Articles
            .Include(a => a.Author)
            .Include(a => a.Attachments)
            .Include(a => a.Comments)
            .Include(a => a.Reactions)
            .Where(a => a.IsPublished)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(a => a.Title.ToLower().Contains(s) || (a.Summary != null && a.Summary.ToLower().Contains(s)) || a.Content.ToLower().Contains(s));
        }

        var totalCount = await query.CountAsync();
        var rawArticles = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var privilegedUserIds = await GetPrivilegedUserIdsAsync(
            currentUserId,
            rawArticles.Select(article => article.AuthorId));
        var items = rawArticles.Select(a => MapToArticleDto(a, currentUserId, privilegedUserIds, User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin), includeComments: false)).ToList();

        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);
        return Ok(new PagedResult<ArticleDto>(items, totalCount, page, pageSize, totalPages));
    }

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<ArticleDto>> GetArticleById(Guid id)
    {
        Guid? currentUserId = null;
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(userIdStr, out var parsedId))
        {
            currentUserId = parsedId;
        }

        var article = await _context.Articles
            .Include(a => a.Author)
            .Include(a => a.Attachments)
            .Include(a => a.Comments)
                .ThenInclude(c => c.Author)
            .Include(a => a.Reactions)
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id);

        if (article == null)
        {
            return NotFound(new { message = "Article not found." });
        }

        if (!article.IsPublished && !HasUnpublishedArticleAccess(article, currentUserId))
        {
            return NotFound(new { message = "Article not found." });
        }

        var privilegedUserIds = await GetPrivilegedUserIdsAsync(
            currentUserId,
            new[] { article.AuthorId }.Concat(article.Comments.Select(comment => comment.AuthorId)));
        var dto = MapToArticleDto(article, currentUserId, privilegedUserIds, User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin), includeComments: true);
        return Ok(dto);
    }

    [HttpPost]
    [Authorize] // Registered users can post articles
    public async Task<ActionResult<ArticleDto>> CreateArticle([FromForm] CreateArticleRequest request, [FromForm] List<IFormFile>? attachments)
    {
        var validator = new CreateArticleRequestValidator();
        var validationResult = await validator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return BadRequest(new { errors = validationResult.Errors.Select(e => e.ErrorMessage) });
        }

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Unauthorized();
        }

        // Limit attachments: max 3 per article
        if (attachments != null && attachments.Count > 3)
        {
            return BadRequest(new { message = "You can upload a maximum of 3 attachments per article." });
        }

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return Unauthorized();
        }

        var article = new Article
        {
            Title = request.Title,
            Summary = request.Summary,
            Content = request.Content,
            PgnData = request.PgnData,
            FenData = request.FenData,
            AuthorId = userId,
            Author = user,
            CreatedAt = DateTime.UtcNow
        };

        if (attachments != null && attachments.Count > 0)
        {
            foreach (var file in attachments)
            {
                try
                {
                    var (storedFileName, contentType, sizeBytes) = await _fileStorage.SaveFileAsync(file, "articles");
                    article.Attachments.Add(new Attachment
                    {
                        FileName = file.FileName,
                        StoredFileName = storedFileName,
                        ContentType = contentType,
                        FileSizeBytes = sizeBytes
                    });
                }
                catch (Exception exception)
                {
                    _logger.LogError(exception, "Failed to save article attachment {FileName} for user {UserId}", file.FileName, userId);
                    return BadRequest(new { message = $"Could not upload file '{file.FileName}'." });
                }
            }
        }

        _context.Articles.Add(article);
        await _context.SaveChangesAsync();

        var privilegedUserIds = await GetPrivilegedUserIdsAsync(
            userId,
            new[] { article.AuthorId }.Concat(article.Comments.Select(comment => comment.AuthorId)));
        var dto = MapToArticleDto(article, userId, privilegedUserIds, User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin), includeComments: true);
        return CreatedAtAction(nameof(GetArticleById), new { id = article.Id }, dto);
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<ArticleDto>> UpdateArticle(Guid id, [FromBody] UpdateArticleRequest request)
    {
        var article = await _context.Articles
            .Include(a => a.Author)
            .Include(a => a.Attachments)
            .Include(a => a.Comments)
                .ThenInclude(c => c.Author)
            .Include(a => a.Reactions)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (article == null)
        {
            return NotFound(new { message = "Article not found." });
        }

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isAdministrator = User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin);
        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Forbid();
        }
        if (!article.IsPublished && !HasUnpublishedArticleAccess(article, userId))
        {
            return NotFound(new { message = "Article not found." });
        }
        if (article.AuthorId != userId && !isAdministrator)
        {
            return Forbid();
        }

        if (string.IsNullOrWhiteSpace(request.Title) || string.IsNullOrWhiteSpace(request.Content))
        {
            return BadRequest(new { message = "Title and content cannot be empty." });
        }

        if (request.Title.Length > 200)
        {
            return BadRequest(new { message = "Title cannot exceed 200 characters." });
        }

        if (request.Content.Length > 30000)
        {
            return BadRequest(new { message = "Content cannot exceed 30,000 characters." });
        }

        if (request.PgnData != null && request.PgnData.Length > 15000)
        {
            return BadRequest(new { message = "PGN data cannot exceed 15,000 characters." });
        }

        if (request.FenData != null && request.FenData.Length > 150)
        {
            return BadRequest(new { message = "FEN data cannot exceed 150 characters." });
        }

        article.Title = request.Title;
        article.Summary = request.Summary;
        article.Content = request.Content;
        article.PgnData = request.PgnData;
        article.FenData = request.FenData;
        if (request.IsPublished.HasValue)
        {
            article.IsPublished = request.IsPublished.Value;
        }
        article.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        var privilegedUserIds = await GetPrivilegedUserIdsAsync(
            userId,
            new[] { article.AuthorId }.Concat(article.Comments.Select(comment => comment.AuthorId)));
        var dto = MapToArticleDto(article, userId, privilegedUserIds, User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin), includeComments: true);
        return Ok(dto);
    }

    [HttpDelete("{id:guid}")]
    [Authorize] // Admin can delete any article; Authors can delete their own
    public async Task<IActionResult> DeleteArticle(Guid id)
    {
        var article = await _context.Articles
            .Include(a => a.Attachments)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (article == null)
        {
            return NotFound(new { message = "Article not found." });
        }

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isAdministrator = User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin);
        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Forbid();
        }
        if (!article.IsPublished && !HasUnpublishedArticleAccess(article, userId))
        {
            return NotFound(new { message = "Article not found." });
        }
        if (article.AuthorId != userId && !isAdministrator)
        {
            return Forbid();
        }

        // Delete physical files
        foreach (var att in article.Attachments)
        {
            await _fileStorage.DeleteFileAsync(att.StoredFileName, "articles");
        }

        _context.Articles.Remove(article);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpPost("{id:guid}/comments")]
    [Authorize] // Registered users can comment
    public async Task<ActionResult<ArticleCommentDto>> AddComment(Guid id, [FromBody] CreateCommentRequest request)
    {
        var validator = new CreateCommentRequestValidator();
        var validationResult = await validator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return BadRequest(new { errors = validationResult.Errors.Select(e => e.ErrorMessage) });
        }

        var article = await _context.Articles.FindAsync(id);
        if (article == null)
        {
            return NotFound(new { message = "Article not found." });
        }

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Unauthorized();
        }

        if (!article.IsPublished && !HasUnpublishedArticleAccess(article, userId))
        {
            return NotFound(new { message = "Article not found." });
        }

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return Unauthorized();
        }

        var comment = new ArticleComment
        {
            ArticleId = id,
            AuthorId = userId,
            Author = user,
            Content = request.Content,
            CreatedAt = DateTime.UtcNow
        };

        _context.ArticleComments.Add(comment);
        await _context.SaveChangesAsync();

        var privilegedUserIds = await GetPrivilegedUserIdsAsync(userId, new[] { userId });
        var commentDto = MapToArticleCommentDto(comment, privilegedUserIds, User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin));

        return Ok(commentDto);
    }

    [HttpDelete("comments/{commentId:guid}")]
    [Authorize] // Author of comment or Admin can delete
    public async Task<IActionResult> DeleteComment(Guid commentId)
    {
        var comment = await _context.ArticleComments
            .Include(row => row.Article)
            .FirstOrDefaultAsync(row => row.Id == commentId);
        if (comment == null)
        {
            return NotFound(new { message = "Comment not found." });
        }

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isAdministrator = User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin);

        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Forbid();
        }
        if (!comment.Article.IsPublished && !HasUnpublishedArticleAccess(comment.Article, userId))
        {
            return NotFound(new { message = "Comment not found." });
        }
        if (comment.AuthorId != userId && !isAdministrator)
        {
            return Forbid();
        }

        _context.ArticleComments.Remove(comment);
        await _context.SaveChangesAsync();

        return NoContent();
    }

    [HttpPost("{id:guid}/reactions")]
    [Authorize] // Registered users can react
    public async Task<ActionResult<IEnumerable<ReactionSummaryDto>>> ToggleReaction(Guid id, [FromBody] ToggleReactionRequest request)
    {
        if (!Enum.IsDefined(request.ReactionType))
        {
            return BadRequest(new { message = "Reaction type is invalid." });
        }

        var article = await _context.Articles.FindAsync(id);
        if (article == null)
        {
            return NotFound(new { message = "Article not found." });
        }

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Unauthorized();
        }
        if (!article.IsPublished && !HasUnpublishedArticleAccess(article, userId))
        {
            return NotFound(new { message = "Article not found." });
        }

        var existingReaction = await _context.ArticleReactions
            .FirstOrDefaultAsync(r => r.ArticleId == id && r.UserId == userId && r.ReactionType == request.ReactionType);

        if (existingReaction != null)
        {
            _context.ArticleReactions.Remove(existingReaction);
        }
        else
        {
            _context.ArticleReactions.Add(new ArticleReaction
            {
                ArticleId = id,
                UserId = userId,
                ReactionType = request.ReactionType,
                CreatedAt = DateTime.UtcNow
            });
        }

        await _context.SaveChangesAsync();

        var reactions = await _context.ArticleReactions
            .Where(r => r.ArticleId == id)
            .ToListAsync();

        var summary = BuildReactionSummary(reactions, userId);
        return Ok(summary);
    }

    [HttpGet("attachments/{attachmentId:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> DownloadAttachment(Guid attachmentId)
    {
        var attachment = await _context.Attachments
            .Include(row => row.Article)
            .FirstOrDefaultAsync(row => row.Id == attachmentId);
        if (attachment?.Article == null)
        {
            return NotFound();
        }

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var currentUserId = Guid.TryParse(userIdStr, out var parsedId) ? parsedId : (Guid?)null;
        if (!attachment.Article.IsPublished && !HasUnpublishedArticleAccess(attachment.Article, currentUserId))
        {
            return NotFound();
        }

        var (stream, contentType, _) = await _fileStorage.GetFileAsync(attachment.StoredFileName, "articles");
        if (stream == null)
        {
            return NotFound(new { message = "File missing from storage." });
        }

        return File(stream, contentType, attachment.FileName);
    }

    private bool HasUnpublishedArticleAccess(Article article, Guid? currentUserId) =>
        currentUserId == article.AuthorId || User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin);

    private static ArticleDto MapToArticleDto(
        Article article,
        Guid? currentUserId,
        ISet<Guid> privilegedUserIds,
        bool isAdministratorViewer,
        bool includeComments)
    {
        var comments = includeComments
            ? article.Comments.OrderBy(c => c.CreatedAt).Select(c => MapToArticleCommentDto(c, privilegedUserIds, isAdministratorViewer)).ToList()
            : new List<ArticleCommentDto>();

        var reactions = BuildReactionSummary(article.Reactions, currentUserId);

        return new ArticleDto(
            article.Id,
            article.Title,
            article.Summary,
            article.Content,
            article.PgnData,
            article.FenData,
            article.IsPublished,
            article.CreatedAt,
            article.UpdatedAt,
            article.AuthorId,
            GetDisplayName(article.Author, privilegedUserIds.Contains(article.AuthorId), isAdministratorViewer, "Anonymous"),
            privilegedUserIds.Contains(article.AuthorId) ? article.Author?.ChessRating : null,
            article.Attachments.Select(att => new AttachmentDto(att.Id, att.FileName, att.ContentType, att.FileSizeBytes, att.UploadedAt)).ToList(),
            comments,
            reactions,
            article.Comments.Count
        );
    }

    private async Task<HashSet<Guid>> GetPrivilegedUserIdsAsync(Guid? currentUserId, IEnumerable<Guid> subjectUserIds)
    {
        var subjects = subjectUserIds.Distinct().ToList();
        if (subjects.Count == 0)
        {
            return [];
        }

        if (User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin))
        {
            return subjects.ToHashSet();
        }

        if (!currentUserId.HasValue)
        {
            return [];
        }

        var sharedTeamUserIds = await _context.TeamMemberships
            .Where(membership => membership.UserId == currentUserId.Value)
            .SelectMany(membership => membership.Team.Memberships)
            .Where(membership => subjects.Contains(membership.UserId))
            .Select(membership => membership.UserId)
            .Distinct()
            .ToListAsync();

        var privilegedUserIds = sharedTeamUserIds.ToHashSet();
        privilegedUserIds.Add(currentUserId.Value);
        return privilegedUserIds;
    }

    private static ArticleCommentDto MapToArticleCommentDto(ArticleComment comment, ISet<Guid> privilegedUserIds, bool isAdministratorViewer)
    {
        var hasSharedIdentityAccess = privilegedUserIds.Contains(comment.AuthorId);
        return new ArticleCommentDto(
            comment.Id,
            comment.ArticleId,
            comment.Content,
            comment.CreatedAt,
            comment.UpdatedAt,
                comment.AuthorId,
                GetDisplayName(comment.Author, hasSharedIdentityAccess, isAdministratorViewer),
                hasSharedIdentityAccess ? comment.Author?.ChessRating : null);
    }

            private static string GetDisplayName(ApplicationUser? user, bool hasSharedIdentityAccess, bool isAdministratorViewer, string fallback = "Member")
    {
        if (user == null)
        {
            return fallback;
        }

        if (!isAdministratorViewer && hasSharedIdentityAccess && !string.IsNullOrWhiteSpace(user.FullName))
        {
            return user.FullName;
        }

        return !string.IsNullOrWhiteSpace(user.Nickname) ? user.Nickname : fallback;
    }

    private static List<ReactionSummaryDto> BuildReactionSummary(IEnumerable<ArticleReaction> reactions, Guid? currentUserId)
    {
        var allTypes = Enum.GetValues<ArticleReactionType>();
        var result = new List<ReactionSummaryDto>();

        foreach (var type in allTypes)
        {
            var count = reactions.Count(r => r.ReactionType == type);
            var userReacted = currentUserId.HasValue && reactions.Any(r => r.ReactionType == type && r.UserId == currentUserId.Value);
            result.Add(new ReactionSummaryDto(type, count, userReacted));
        }

        return result;
    }
}
