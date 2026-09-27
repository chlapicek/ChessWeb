using System.Security.Claims;
using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using ChessWeb.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChessWeb.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly NotificationService _notificationService;

    public NotificationsController(NotificationService notificationService)
    {
        _notificationService = notificationService;
    }

    [HttpGet]
    public async Task<ActionResult<NotificationInboxDto>> GetInbox([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] bool? unreadOnly = null, CancellationToken cancellationToken = default)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        return Ok(await _notificationService.GetInboxAsync(userId, page, pageSize, unreadOnly, cancellationToken));
    }

    [HttpGet("unread-count")]
    public async Task<ActionResult<int>> GetUnreadCount(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        return Ok(new { count = await _notificationService.GetUnreadCountAsync(userId, cancellationToken) });
    }

    [HttpGet("audience-options")]
    public async Task<ActionResult<NotificationAudienceOptionsDto>> GetAudienceOptions(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        var isAdministrator = User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin);
        return Ok(await _notificationService.GetAudienceOptionsAsync(userId, isAdministrator, cancellationToken));
    }

    [HttpPut("{notificationId:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid notificationId, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        return await _notificationService.MarkReadAsync(userId, notificationId, cancellationToken) ? NoContent() : NotFound();
    }

    [HttpDelete("{notificationId:guid}")]
    public async Task<IActionResult> DeleteRead(Guid notificationId, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        return await _notificationService.DeleteReadAsync(userId, notificationId, cancellationToken) ? NoContent() : NotFound();
    }

    [HttpPost]
    public async Task<ActionResult<NotificationSendResult>> Send([FromBody] SendNotificationRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();
        var isAdministrator = User.IsInRole(Roles.Admin) || User.IsInRole(Roles.SuperAdmin);
        var senderName = User.FindFirstValue("fullName") ?? User.FindFirstValue(ClaimTypes.Name) ?? "ChessWeb member";
        try
        {
            return Ok(await _notificationService.SendAsync(userId, senderName, isAdministrator, request, cancellationToken));
        }
        catch (NotificationForbiddenException)
        {
            return Forbid();
        }
        catch (NotificationValidationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }

    private bool TryGetUserId(out Guid userId) => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);
}