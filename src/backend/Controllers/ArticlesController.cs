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
    public const int MaxAttachmentsPerArticle = 10;
    private const int MaxPendingUploadsPerUser = 20;
    private const int ExcerptLength = 300;
    private const int MaxCommentsPageSize = 50;
    private const string AttachmentsFolder = "articles";
    private static readonly TimeSpan UnattachedUploadLifetime = TimeSpan.FromHours(24);

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

    private bool IsAdministrator => User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin);

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<PagedResult<ArticleDto>>> GetArticles(
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 50);

        var currentUserId = GetCurrentUserId();

        var query = _context.Articles
            .Include(a => a.Author)
            .Include(a => a.Attachments)
            .Include(a => a.Reactions)
            .Where(a => a.IsPublished)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(a => a.Title.ToLower().Contains(s) || (a.Summary != null && a.Summary.ToLower().Contains(s)) || (a.ContentText != null && a.ContentText.ToLower().Contains(s)));
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
        var articleIds = rawArticles.Select(article => article.Id).ToList();
        var commentCounts = await _context.ArticleComments
            .Where(comment => articleIds.Contains(comment.ArticleId))
            .GroupBy(comment => comment.ArticleId)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToDictionaryAsync(row => row.Key, row => row.Count);
        var items = rawArticles
            .Select(a => MapToArticleDto(a, currentUserId, privilegedUserIds, commentCounts.GetValueOrDefault(a.Id), includeCollection: false))
            .ToList();

        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);
        return Ok(new PagedResult<ArticleDto>(items, totalCount, page, pageSize, totalPages));
    }

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<ActionResult<ArticleDto>> GetArticleById(Guid id)
    {
        var currentUserId = GetCurrentUserId();
        var article = await LoadArticleDetailAsync(id);
        if (article == null || !CanView(article, currentUserId))
        {
            return NotFound(new { message = "Article not found." });
        }

        return Ok(await BuildDetailDtoAsync(article, currentUserId));
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

        var legacyFileCount = attachments?.Count ?? 0;
        if (legacyFileCount > MaxAttachmentsPerArticle)
        {
            return BadRequest(new { message = $"You can upload a maximum of {MaxAttachmentsPerArticle} attachments per article." });
        }

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            return Unauthorized();
        }

        var collectionError = await ValidateCollectionLinkAsync(request.GameCollectionId, null, userId);
        if (collectionError != null)
        {
            return collectionError;
        }

        var prepared = await PrepareContentAsync(request.ContentFormat, request.Content, null, userId);
        if (prepared.Error != null)
        {
            return BadRequest(new { message = prepared.Error });
        }

        if (legacyFileCount + prepared.UploadsToLink.Count > MaxAttachmentsPerArticle)
        {
            return BadRequest(new { message = $"You can upload a maximum of {MaxAttachmentsPerArticle} attachments per article." });
        }

        var article = new Article
        {
            Title = request.Title,
            Summary = request.Summary,
            Content = request.Content,
            ContentFormat = request.ContentFormat,
            ContentText = prepared.ContentText,
            PgnData = request.PgnData,
            FenData = request.FenData,
            GameCollectionId = request.GameCollectionId,
            AuthorId = userId,
            Author = user,
            CreatedAt = DateTime.UtcNow
        };

        foreach (var upload in prepared.UploadsToLink)
        {
            article.Attachments.Add(upload);
        }

        if (attachments != null && attachments.Count > 0)
        {
            foreach (var file in attachments)
            {
                try
                {
                    var (storedFileName, contentType, sizeBytes) = await _fileStorage.SaveFileAsync(file, AttachmentsFolder);
                    article.Attachments.Add(new Attachment
                    {
                        FileName = file.FileName,
                        StoredFileName = storedFileName,
                        ContentType = contentType,
                        FileSizeBytes = sizeBytes,
                        UploadedByUserId = userId
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

        var created = await LoadArticleDetailAsync(article.Id);
        return CreatedAtAction(nameof(GetArticleById), new { id = article.Id }, await BuildDetailDtoAsync(created!, userId));
    }

    [HttpPut("{id:guid}")]
    [Authorize]
    public async Task<ActionResult<ArticleDto>> UpdateArticle(Guid id, [FromBody] UpdateArticleRequest request)
    {
        var article = await _context.Articles
            .Include(a => a.Attachments)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (article == null)
        {
            return NotFound(new { message = "Article not found." });
        }

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Forbid();
        }
        if (!CanView(article, userId))
        {
            return NotFound(new { message = "Article not found." });
        }
        if (article.AuthorId != userId && !IsAdministrator)
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

        if (!Enum.IsDefined(request.ContentFormat))
        {
            return BadRequest(new { message = "Content format is invalid." });
        }

        var maxContentLength = CreateArticleRequestValidator.MaxContentLengthFor(request.ContentFormat);
        if (request.Content.Length > maxContentLength)
        {
            return BadRequest(new { message = $"Content cannot exceed {maxContentLength:N0} characters." });
        }

        if (request.PgnData != null && request.PgnData.Length > 15000)
        {
            return BadRequest(new { message = "PGN data cannot exceed 15,000 characters." });
        }

        if (request.FenData != null && request.FenData.Length > 150)
        {
            return BadRequest(new { message = "FEN data cannot exceed 150 characters." });
        }

        var collectionError = await ValidateCollectionLinkAsync(request.GameCollectionId, article.GameCollectionId, userId);
        if (collectionError != null)
        {
            return collectionError;
        }

        var prepared = await PrepareContentAsync(request.ContentFormat, request.Content, article.Id, userId);
        if (prepared.Error != null)
        {
            return BadRequest(new { message = prepared.Error });
        }

        if (article.Attachments.Count + prepared.UploadsToLink.Count > MaxAttachmentsPerArticle)
        {
            return BadRequest(new { message = $"You can upload a maximum of {MaxAttachmentsPerArticle} attachments per article." });
        }

        article.Title = request.Title;
        article.Summary = request.Summary;
        article.Content = request.Content;
        article.ContentFormat = request.ContentFormat;
        article.ContentText = prepared.ContentText;
        article.PgnData = request.PgnData;
        article.FenData = request.FenData;
        article.GameCollectionId = request.GameCollectionId;
        if (request.IsPublished.HasValue)
        {
            article.IsPublished = request.IsPublished.Value;
        }
        article.UpdatedAt = DateTime.UtcNow;
        foreach (var upload in prepared.UploadsToLink)
        {
            article.Attachments.Add(upload);
        }

        await _context.SaveChangesAsync();

        var updated = await LoadArticleDetailAsync(article.Id);
        return Ok(await BuildDetailDtoAsync(updated!, userId));
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

    [HttpGet("{id:guid}/comments")]
    [AllowAnonymous]
    public async Task<ActionResult<PagedResult<ArticleCommentDto>>> GetComments(
        Guid id,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10)
    {
        page = Math.Clamp(page, 1, 1_000_000);
        pageSize = Math.Clamp(pageSize, 1, MaxCommentsPageSize);

        var currentUserId = GetCurrentUserId();
        var article = await _context.Articles.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id);
        if (article == null || !CanView(article, currentUserId))
        {
            return NotFound(new { message = "Article not found." });
        }

        var query = _context.ArticleComments.AsNoTracking().Where(comment => comment.ArticleId == id);
        var totalCount = await query.CountAsync();
        var comments = await query
            .Include(comment => comment.Author)
            .Include(comment => comment.Reactions)
            .OrderBy(comment => comment.CreatedAt)
            .ThenBy(comment => comment.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var privilegedUserIds = await GetPrivilegedUserIdsAsync(currentUserId, comments.Select(comment => comment.AuthorId));
        var items = comments.Select(comment => MapToArticleCommentDto(comment, article, currentUserId, privilegedUserIds)).ToList();
        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);
        return Ok(new PagedResult<ArticleCommentDto>(items, totalCount, page, pageSize, totalPages));
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

        if (!CanView(article, userId))
        {
            return NotFound(new { message = "Article not found." });
        }

        if (!CanComment(article, userId))
        {
            return CommentsLockedResult();
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
        return Ok(MapToArticleCommentDto(comment, article, userId, privilegedUserIds));
    }

    [HttpPut("comments/{commentId:guid}")]
    [Authorize] // Only the comment author can edit
    public async Task<ActionResult<ArticleCommentDto>> UpdateComment(Guid commentId, [FromBody] CreateCommentRequest request)
    {
        var validator = new CreateCommentRequestValidator();
        var validationResult = await validator.ValidateAsync(request);
        if (!validationResult.IsValid)
        {
            return BadRequest(new { errors = validationResult.Errors.Select(e => e.ErrorMessage) });
        }

        var comment = await _context.ArticleComments
            .Include(row => row.Article)
            .Include(row => row.Author)
            .Include(row => row.Reactions)
            .FirstOrDefaultAsync(row => row.Id == commentId);
        if (comment == null)
        {
            return NotFound(new { message = "Comment not found." });
        }

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Unauthorized();
        }
        if (!CanView(comment.Article, userId))
        {
            return NotFound(new { message = "Comment not found." });
        }
        if (comment.AuthorId != userId)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Only the comment author can edit this comment." });
        }
        if (!CanComment(comment.Article, userId))
        {
            return CommentsLockedResult();
        }

        comment.Content = request.Content;
        comment.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        var privilegedUserIds = await GetPrivilegedUserIdsAsync(userId, new[] { userId });
        return Ok(MapToArticleCommentDto(comment, comment.Article, userId, privilegedUserIds));
    }

    [HttpPost("comments/{commentId:guid}/reactions")]
    [Authorize]
    public async Task<ActionResult<IEnumerable<ReactionSummaryDto>>> ToggleCommentReaction(Guid commentId, [FromBody] ToggleReactionRequest request)
    {
        if (!Enum.IsDefined(request.ReactionType))
        {
            return BadRequest(new { message = "Reaction type is invalid." });
        }

        var comment = await _context.ArticleComments
            .Include(row => row.Article)
            .FirstOrDefaultAsync(row => row.Id == commentId);
        if (comment == null)
        {
            return NotFound(new { message = "Comment not found." });
        }

        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Unauthorized();
        }
        if (!CanView(comment.Article, userId))
        {
            return NotFound(new { message = "Comment not found." });
        }

        var existingReaction = await _context.ArticleCommentReactions
            .FirstOrDefaultAsync(r => r.CommentId == commentId && r.UserId == userId && r.ReactionType == request.ReactionType);
        if (existingReaction != null)
        {
            _context.ArticleCommentReactions.Remove(existingReaction);
        }
        else
        {
            _context.ArticleCommentReactions.Add(new ArticleCommentReaction
            {
                CommentId = commentId,
                UserId = userId,
                ReactionType = request.ReactionType,
                CreatedAt = DateTime.UtcNow
            });
        }

        await _context.SaveChangesAsync();

        var reactions = await _context.ArticleCommentReactions
            .Where(r => r.CommentId == commentId)
            .Select(r => new { r.ReactionType, r.UserId })
            .ToListAsync();
        return Ok(BuildReactionSummary(reactions.Select(r => (r.ReactionType, r.UserId)), userId));
    }

    [HttpPut("{id:guid}/comments-lock")]
    [Authorize] // Article author or administrators
    public async Task<ActionResult<CommentsLockDto>> SetCommentsLock(Guid id, [FromBody] SetCommentsLockRequest request)
    {
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
        if (!CanView(article, userId))
        {
            return NotFound(new { message = "Article not found." });
        }
        if (article.AuthorId != userId && !IsAdministrator)
        {
            return Forbid();
        }

        article.CommentsLocked = request.Locked;
        await _context.SaveChangesAsync();
        return Ok(new CommentsLockDto(article.CommentsLocked));
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

        var summary = BuildReactionSummary(reactions.Select(r => (r.ReactionType, r.UserId)), userId);
        return Ok(summary);
    }

    [HttpPost("attachments")]
    [Authorize] // Inline upload for rich content; linked to an article on create/update
    public async Task<ActionResult<AttachmentDto>> UploadAttachment(IFormFile? file)
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Unauthorized();
        }
        if (file == null)
        {
            return BadRequest(new { message = "A file is required." });
        }

        await RemoveExpiredUploadsAsync();

        var pendingUploads = await _context.Attachments.CountAsync(a => a.ArticleId == null && a.UploadedByUserId == userId);
        if (pendingUploads >= MaxPendingUploadsPerUser)
        {
            return BadRequest(new { message = $"You can have at most {MaxPendingUploadsPerUser} unattached uploads. Save your article or wait before uploading more." });
        }

        string storedFileName;
        string contentType;
        long sizeBytes;
        try
        {
            (storedFileName, contentType, sizeBytes) = await _fileStorage.SaveFileAsync(file, AttachmentsFolder);
        }
        catch (Exception exception) when (exception is ArgumentException or InvalidOperationException)
        {
            return BadRequest(new { message = exception.Message });
        }

        var attachment = new Attachment
        {
            FileName = file.FileName,
            StoredFileName = storedFileName,
            ContentType = contentType,
            FileSizeBytes = sizeBytes,
            UploadedByUserId = userId
        };
        _context.Attachments.Add(attachment);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(DownloadAttachment), new { attachmentId = attachment.Id }, MapToAttachmentDto(attachment));
    }

    [HttpGet("attachments/{attachmentId:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> DownloadAttachment(Guid attachmentId)
    {
        var attachment = await _context.Attachments
            .Include(row => row.Article)
            .FirstOrDefaultAsync(row => row.Id == attachmentId);
        if (attachment == null)
        {
            return NotFound();
        }

        var currentUserId = GetCurrentUserId();
        var canDownload = attachment.Article == null
            ? attachment.UploadedByUserId != null && attachment.UploadedByUserId == currentUserId
            : CanView(attachment.Article, currentUserId);
        if (!canDownload)
        {
            return NotFound();
        }

        var (stream, contentType, _) = await _fileStorage.GetFileAsync(attachment.StoredFileName, AttachmentsFolder);
        if (stream == null)
        {
            return NotFound(new { message = "File missing from storage." });
        }

        return File(stream, contentType, attachment.FileName);
    }

    private sealed record PreparedContent(string? Error, string ContentText, IReadOnlyList<Attachment> UploadsToLink);

    private async Task<PreparedContent> PrepareContentAsync(ArticleContentFormat format, string content, Guid? articleId, Guid userId)
    {
        if (format == ArticleContentFormat.PlainText)
        {
            return new PreparedContent(null, content, []);
        }

        var result = RichContentValidator.Validate(content);
        if (!result.IsValid)
        {
            return new PreparedContent(result.Error, string.Empty, []);
        }

        if (result.AttachmentIds.Count == 0)
        {
            return new PreparedContent(null, result.PlainText, []);
        }

        var referencedIds = result.AttachmentIds.ToList();
        var referenced = await _context.Attachments.Where(a => referencedIds.Contains(a.Id)).ToListAsync();
        var usable = referenced
            .Where(a => (articleId != null && a.ArticleId == articleId) || (a.ArticleId == null && a.UploadedByUserId == userId))
            .ToList();
        if (usable.Count != referencedIds.Count)
        {
            return new PreparedContent("Rich content references an attachment that does not exist or is not available to you.", string.Empty, []);
        }

        return new PreparedContent(null, result.PlainText, usable.Where(a => a.ArticleId == null).ToList());
    }

    private async Task<ActionResult?> ValidateCollectionLinkAsync(Guid? collectionId, Guid? currentCollectionId, Guid userId)
    {
        if (collectionId is not Guid requestedId || requestedId == currentCollectionId)
        {
            return null;
        }

        var ownerId = await _context.GameCollections
            .Where(c => c.Id == requestedId)
            .Select(c => (Guid?)c.CreatedByUserId)
            .FirstOrDefaultAsync();
        if (ownerId == null)
        {
            return BadRequest(new { message = "Game collection not found." });
        }
        if (ownerId != userId && !IsAdministrator)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "You can only link your own game collections." });
        }

        return null;
    }

    private async Task RemoveExpiredUploadsAsync()
    {
        var cutoff = DateTime.UtcNow - UnattachedUploadLifetime;
        var expired = await _context.Attachments
            .Where(a => a.ArticleId == null && a.UploadedByUserId != null && a.UploadedAt < cutoff)
            .Take(100)
            .ToListAsync();
        if (expired.Count == 0)
        {
            return;
        }

        foreach (var attachment in expired)
        {
            await _fileStorage.DeleteFileAsync(attachment.StoredFileName, AttachmentsFolder);
        }
        _context.Attachments.RemoveRange(expired);
        await _context.SaveChangesAsync();
    }

    private Task<Article?> LoadArticleDetailAsync(Guid id) =>
        _context.Articles
            .Include(a => a.Author)
            .Include(a => a.Attachments)
            .Include(a => a.Reactions)
            .Include(a => a.GameCollection)
                .ThenInclude(c => c!.Games)
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id);

    private async Task<ArticleDto> BuildDetailDtoAsync(Article article, Guid? currentUserId)
    {
        var privilegedUserIds = await GetPrivilegedUserIdsAsync(currentUserId, new[] { article.AuthorId });
        var commentsCount = await _context.ArticleComments.CountAsync(comment => comment.ArticleId == article.Id);
        return MapToArticleDto(article, currentUserId, privilegedUserIds, commentsCount, includeCollection: true);
    }

    private Guid? GetCurrentUserId() =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ? userId : null;

    private bool CanView(Article article, Guid? currentUserId) =>
        article.IsPublished || HasUnpublishedArticleAccess(article, currentUserId);

    private bool CanComment(Article article, Guid? currentUserId) =>
        !article.CommentsLocked || currentUserId == article.AuthorId || IsAdministrator;

    private ObjectResult CommentsLockedResult() =>
        StatusCode(StatusCodes.Status403Forbidden, new { message = "Comments are locked for this article." });

    private bool HasUnpublishedArticleAccess(Article article, Guid? currentUserId) =>
        currentUserId == article.AuthorId || IsAdministrator;

    private ArticleDto MapToArticleDto(
        Article article,
        Guid? currentUserId,
        ISet<Guid> privilegedUserIds,
        int commentsCount,
        bool includeCollection)
    {
        var reactions = BuildReactionSummary(article.Reactions.Select(r => (r.ReactionType, r.UserId)), currentUserId);
        var collection = includeCollection && article.GameCollection != null
            ? new ArticleCollectionDto(
                article.GameCollection.Id,
                article.GameCollection.Name,
                article.GameCollection.Games
                    .OrderBy(g => g.OrderIndex)
                    .Select(g => new GameCollectionGameDto(g.Id, g.OrderIndex, g.Pgn, g.Label))
                    .ToList())
            : null;

        return new ArticleDto(
            article.Id,
            article.Title,
            article.Summary,
            article.Content,
            article.ContentFormat,
            BuildExcerpt(article),
            article.PgnData,
            article.FenData,
            article.IsPublished,
            article.CreatedAt,
            article.UpdatedAt,
            article.AuthorId,
            GetDisplayName(article.Author, privilegedUserIds.Contains(article.AuthorId), IsAdministrator, "Anonymous"),
            privilegedUserIds.Contains(article.AuthorId) ? article.Author?.ChessRating : null,
            article.Attachments.Select(MapToAttachmentDto).ToList(),
            reactions,
            commentsCount,
            article.CommentsLocked,
            article.GameCollectionId,
            collection
        );
    }

    private static AttachmentDto MapToAttachmentDto(Attachment attachment) =>
        new(attachment.Id, attachment.FileName, attachment.ContentType, attachment.FileSizeBytes, attachment.UploadedAt);

    private static string BuildExcerpt(Article article)
    {
        var text = (article.ContentText ?? (article.ContentFormat == ArticleContentFormat.PlainText ? article.Content : string.Empty)).Trim();
        if (text.Length <= ExcerptLength)
        {
            return text;
        }

        var cut = char.IsHighSurrogate(text[ExcerptLength - 1]) ? ExcerptLength - 1 : ExcerptLength;
        return text[..cut].TrimEnd() + "…";
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

    private ArticleCommentDto MapToArticleCommentDto(ArticleComment comment, Article article, Guid? currentUserId, ISet<Guid> privilegedUserIds)
    {
        var hasSharedIdentityAccess = privilegedUserIds.Contains(comment.AuthorId);
        var isCommentAuthor = currentUserId == comment.AuthorId;
        return new ArticleCommentDto(
            comment.Id,
            comment.ArticleId,
            comment.Content,
            comment.CreatedAt,
            comment.UpdatedAt,
            comment.AuthorId,
            GetDisplayName(comment.Author, hasSharedIdentityAccess, IsAdministrator),
            hasSharedIdentityAccess ? comment.Author?.ChessRating : null,
            BuildReactionSummary(comment.Reactions.Select(r => (r.ReactionType, r.UserId)), currentUserId),
            isCommentAuthor && CanComment(article, currentUserId),
            isCommentAuthor || IsAdministrator);
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

    private static List<ReactionSummaryDto> BuildReactionSummary(IEnumerable<(ArticleReactionType Type, Guid UserId)> reactions, Guid? currentUserId)
    {
        var reactionList = reactions.ToList();
        return Enum.GetValues<ArticleReactionType>()
            .Select(type => new ReactionSummaryDto(
                type,
                reactionList.Count(r => r.Type == type),
                currentUserId.HasValue && reactionList.Any(r => r.Type == type && r.UserId == currentUserId.Value)))
            .ToList();
    }
}
