using System.Data;
using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Services;

public sealed class NotificationService
{
    public const int MaxTitleLength = 120;
    public const int MaxMessageLength = 4000;
    public const int MaxInternalLinkLength = 300;
    public const int MaxSenderNameLength = 200;
    public const int MaxRecipients = 500;
    public const int MaxPageSize = 50;

    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<ApplicationRole> _roleManager;
    private readonly TimeProvider _timeProvider;

    public NotificationService(
        ApplicationDbContext context,
        UserManager<ApplicationUser> userManager,
        RoleManager<ApplicationRole> roleManager,
        TimeProvider timeProvider)
    {
        _context = context;
        _userManager = userManager;
        _roleManager = roleManager;
        _timeProvider = timeProvider;
    }

    public async Task<NotificationAudienceOptionsDto> GetAudienceOptionsAsync(Guid senderId, bool isAdministrator, CancellationToken cancellationToken)
    {
        var teamsQuery = _context.Teams.AsNoTracking();
        if (!isAdministrator)
        {
            teamsQuery = teamsQuery.Where(team => team.CaptainUserId == senderId);
        }

        var teams = await teamsQuery.OrderBy(team => team.Name)
            .Select(team => new NotificationAudienceTeamDto(team.Id, team.Name))
            .ToListAsync(cancellationToken);

        if (!isAdministrator)
        {
            return new NotificationAudienceOptionsDto(teams, [], [], false);
        }

        var users = await _context.Users.AsNoTracking()
            .OrderBy(user => user.FullName)
            .Select(user => new NotificationAudienceUserDto(user.Id, user.FullName, user.Email ?? string.Empty))
            .ToListAsync(cancellationToken);

        return new NotificationAudienceOptionsDto(teams, users, Roles.AllRoles, true);
    }

    public async Task<NotificationInboxDto> GetInboxAsync(Guid userId, int page, int pageSize, bool? unreadOnly, CancellationToken cancellationToken)
    {
        page = Math.Clamp(page, 1, 1_000_000);
        pageSize = Math.Clamp(pageSize, 1, MaxPageSize);
        var query = _context.NotificationRecipients.AsNoTracking().Where(recipient => recipient.UserId == userId);
        if (unreadOnly == true)
        {
            query = query.Where(recipient => !recipient.IsRead);
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var items = await query.OrderByDescending(recipient => recipient.Notification.CreatedAt)
            .ThenByDescending(recipient => recipient.NotificationId)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(recipient => new NotificationInboxItemDto(
                recipient.NotificationId,
                recipient.Notification.Title,
                recipient.Notification.Message,
                recipient.Notification.InternalLink,
                recipient.Notification.SenderName,
                recipient.Notification.CreatedAt,
                recipient.IsRead,
                recipient.ReadAt))
            .ToListAsync(cancellationToken);

        return new NotificationInboxDto(items, page, pageSize, totalCount, (int)Math.Ceiling(totalCount / (double)pageSize));
    }

    public Task<int> GetUnreadCountAsync(Guid userId, CancellationToken cancellationToken) =>
        _context.NotificationRecipients.CountAsync(recipient => recipient.UserId == userId && !recipient.IsRead, cancellationToken);

    public async Task<bool> MarkReadAsync(Guid userId, Guid notificationId, CancellationToken cancellationToken)
    {
        var recipient = await _context.NotificationRecipients
            .FirstOrDefaultAsync(row => row.UserId == userId && row.NotificationId == notificationId, cancellationToken);
        if (recipient == null)
        {
            return false;
        }

        if (!recipient.IsRead)
        {
            recipient.IsRead = true;
            recipient.ReadAt = _timeProvider.GetUtcNow().UtcDateTime;
            await _context.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    public async Task<bool> DeleteReadAsync(Guid userId, Guid notificationId, CancellationToken cancellationToken)
    {
        var recipient = await _context.NotificationRecipients
            .FirstOrDefaultAsync(row => row.UserId == userId && row.NotificationId == notificationId && row.IsRead, cancellationToken);
        if (recipient == null)
        {
            return false;
        }

        _context.NotificationRecipients.Remove(recipient);
        await _context.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<NotificationSendResult> SendAsync(Guid senderId, string senderName, bool isAdministrator, SendNotificationRequest request, CancellationToken cancellationToken)
    {
        ValidateContent(request);
        var normalizedSenderName = NormalizeSenderName(senderName);

        await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var recipientIds = await ResolveRecipientsAsync(senderId, isAdministrator, request, cancellationToken);
        if (recipientIds.Count == 0)
        {
            throw new NotificationValidationException("The selected audience has no eligible recipients.");
        }
        if (recipientIds.Count > MaxRecipients)
        {
            throw new NotificationValidationException($"An audience cannot exceed {MaxRecipients} recipients.");
        }

        var notification = new Notification
        {
            Title = request.Title!.Trim(),
            Message = request.Message!,
            InternalLink = string.IsNullOrWhiteSpace(request.InternalLink) ? null : request.InternalLink.Trim(),
            SenderUserId = senderId,
            SenderName = normalizedSenderName,
            CreatedAt = _timeProvider.GetUtcNow().UtcDateTime,
            Recipients = recipientIds.Select(userId => new NotificationRecipient { UserId = userId }).ToList()
        };

        _context.Notifications.Add(notification);
        await _context.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new NotificationSendResult(notification.Id, recipientIds.Count);
    }

    private async Task<List<Guid>> ResolveRecipientsAsync(Guid senderId, bool isAdministrator, SendNotificationRequest request, CancellationToken cancellationToken)
    {
        var audience = request.Audience?.Trim().ToLowerInvariant();
        if (audience == "team")
        {
            if (request.TeamIds is not { Count: 1 } || request.UserIds is { Count: > 0 } || request.Roles is { Count: > 0 })
            {
                throw new NotificationValidationException("A team audience requires only a team identifier.");
            }

            var team = await _context.Teams.AsNoTracking().FirstOrDefaultAsync(row => row.Id == request.TeamIds[0], cancellationToken);
            if (team == null)
            {
                throw new NotificationValidationException("The selected team was not found.");
            }
            if (!isAdministrator && team.CaptainUserId != senderId)
            {
                throw new NotificationForbiddenException();
            }

            return await GetRegisteredTeamRecipientsAsync(team.Id, cancellationToken);
        }

        if (!isAdministrator)
        {
            throw new NotificationForbiddenException();
        }

        if (audience != "admin" ||
            (request.TeamIds?.Count ?? 0) > MaxRecipients ||
            (request.UserIds?.Count ?? 0) > MaxRecipients ||
            (request.Roles?.Count ?? 0) > Roles.AllRoles.Count ||
            ((request.TeamIds?.Count ?? 0) == 0 && (request.UserIds?.Count ?? 0) == 0 && (request.Roles?.Count ?? 0) == 0))
        {
            throw new NotificationValidationException("Select at least one valid team, account, or role audience.");
        }

        var recipientIds = new HashSet<Guid>();
        var requestedTeamIds = request.TeamIds?.Distinct().ToList() ?? [];
        if (requestedTeamIds.Count > 0)
        {
            var existingTeamIds = await _context.Teams.AsNoTracking().Where(team => requestedTeamIds.Contains(team.Id)).Select(team => team.Id).ToListAsync(cancellationToken);
            if (existingTeamIds.Count != requestedTeamIds.Count)
            {
                throw new NotificationValidationException("One or more selected teams were not found.");
            }

            foreach (var teamId in existingTeamIds)
            {
                foreach (var userId in await GetRegisteredTeamRecipientsAsync(teamId, cancellationToken)) recipientIds.Add(userId);
            }
        }

        var requestedUserIds = request.UserIds?.Distinct().ToList() ?? [];
        if (requestedUserIds.Count > 0)
        {
            var requestedIds = requestedUserIds;
            var existingIds = await _context.Users.AsNoTracking().Where(user => requestedIds.Contains(user.Id)).Select(user => user.Id).ToListAsync(cancellationToken);
            if (existingIds.Count != requestedIds.Count)
            {
                throw new NotificationValidationException("One or more selected accounts were not found.");
            }
            foreach (var userId in existingIds) recipientIds.Add(userId);
        }

        var requestedRoles = request.Roles?.Distinct(StringComparer.Ordinal).ToList() ?? [];
        if (requestedRoles.Any(role => !Roles.AllRoles.Contains(role)))
        {
            throw new NotificationValidationException("One or more selected account roles are invalid.");
        }

        foreach (var role in requestedRoles)
        {
            var users = await _userManager.GetUsersInRoleAsync(role);
            foreach (var user in users) recipientIds.Add(user.Id);
        }

        return recipientIds.ToList();
    }

    private static string NormalizeSenderName(string? senderName)
    {
        var normalizedName = string.IsNullOrWhiteSpace(senderName) ? "ChessWeb member" : senderName.Trim();
        if (normalizedName.Length <= MaxSenderNameLength)
        {
            return normalizedName;
        }

        var length = MaxSenderNameLength;
        if (char.IsHighSurrogate(normalizedName[length - 1]) && char.IsLowSurrogate(normalizedName[length]))
        {
            length--;
        }

        return normalizedName[..length];
    }

    private async Task<List<Guid>> GetRegisteredTeamRecipientsAsync(Guid teamId, CancellationToken cancellationToken)
    {
        var registeredRole = await _roleManager.FindByNameAsync(Roles.RegisteredUser);
        if (registeredRole == null)
        {
            return [];
        }

        return await _context.TeamMemberships.AsNoTracking()
            .Where(membership => membership.TeamId == teamId && _context.UserRoles.Any(userRole => userRole.UserId == membership.UserId && userRole.RoleId == registeredRole.Id))
            .Select(membership => membership.UserId)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    private static void ValidateContent(SendNotificationRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Trim().Length > MaxTitleLength)
        {
            throw new NotificationValidationException($"Title is required and must be at most {MaxTitleLength} characters.");
        }
        if (string.IsNullOrWhiteSpace(request.Message) || request.Message.Length > MaxMessageLength)
        {
            throw new NotificationValidationException($"Message is required and must be at most {MaxMessageLength} characters.");
        }
        if (request.InternalLink is { Length: > MaxInternalLinkLength } || !IsSafeInternalLink(request.InternalLink))
        {
            throw new NotificationValidationException("The internal link must be a safe app-relative path.");
        }
    }

    private static bool IsSafeInternalLink(string? link)
    {
        if (string.IsNullOrWhiteSpace(link))
        {
            return true;
        }

        var value = link.Trim();
        return value.StartsWith('/') && !value.StartsWith("//", StringComparison.Ordinal) &&
            !value.Contains('\\') && !value.Any(char.IsControl);
    }
}

public sealed class NotificationValidationException(string message) : Exception(message);
public sealed class NotificationForbiddenException : Exception;