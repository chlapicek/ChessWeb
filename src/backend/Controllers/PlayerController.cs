using System.Security.Claims;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PlayerController : ControllerBase
{
    private const int MaxFullNameLength = 200;
    private const int MaxNicknameLength = 100;

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<PlayerController> _logger;

    public PlayerController(UserManager<ApplicationUser> userManager, ILogger<PlayerController> logger)
    {
        _userManager = userManager;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<PlayerSummaryDto>>> GetPlayers()
    {
        var players = await _userManager.Users
            .AsNoTracking()
            .OrderBy(u => u.FullName)
            .Select(u => new PlayerSummaryDto(u.Id, u.FullName, u.Nickname, u.ChessRating, u.FideId))
            .ToListAsync();

        return Ok(players);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PlayerProfileDto>> GetPlayer(Guid id)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user == null)
        {
            return NotFound(new { message = "User not found." });
        }

        var currentUserIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var isSelf = Guid.TryParse(currentUserIdStr, out var currentUserId) && currentUserId == id;

        return Ok(new PlayerProfileDto(user.Id, user.FullName, user.Nickname, user.ChessRating, user.FideId, isSelf));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Admin + "," + Roles.SuperAdmin)]
    public async Task<ActionResult<UserDto>> UpdatePlayer(Guid id, [FromBody] UpdatePlayerRequest request)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user == null)
        {
            return NotFound(new { message = "User not found." });
        }

        if (string.IsNullOrWhiteSpace(request.FullName))
        {
            return BadRequest(new { message = "Full name is required." });
        }

        if (request.FullName.Length > MaxFullNameLength)
        {
            return BadRequest(new { message = $"Full name cannot exceed {MaxFullNameLength} characters." });
        }

        if (string.IsNullOrWhiteSpace(request.Email) || !IsValidEmail(request.Email))
        {
            return BadRequest(new { message = "A valid email address is required." });
        }

        var existingUserWithEmail = await _userManager.FindByEmailAsync(request.Email);
        if (existingUserWithEmail != null && existingUserWithEmail.Id != id)
        {
            return Conflict(new { message = "A user with this email address already exists." });
        }

        var nicknameResult = await ResolveNicknameAsync(request.Nickname, id);
        if (nicknameResult.Error != null)
        {
            return Conflict(new { message = nicknameResult.Error });
        }

        user.FullName = request.FullName.Trim();
        user.Email = request.Email;
        user.UserName = request.Email;
        user.ChessRating = request.ChessRating;
        user.FideId = request.FideId;
        user.Nickname = nicknameResult.Nickname;

        var updateResult = await _userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            return BadRequest(new { errors = updateResult.Errors.Select(error => error.Description) });
        }

        var roles = await _userManager.GetRolesAsync(user);
        return Ok(new UserDto(user.Id, user.Email!, user.Nickname, user.FullName, user.ChessRating, user.FideId, roles.ToList()));
    }

    [HttpPut("me/nickname")]
    public async Task<ActionResult<UserDto>> UpdateMyNickname([FromBody] UpdateNicknameRequest request)
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdStr, out var userId))
        {
            return Unauthorized();
        }

        var user = await _userManager.FindByIdAsync(userId.ToString());
        if (user == null)
        {
            return NotFound(new { message = "User not found." });
        }

        var nicknameResult = await ResolveNicknameAsync(request.Nickname, userId);
        if (nicknameResult.Error != null)
        {
            return Conflict(new { message = nicknameResult.Error });
        }

        user.Nickname = nicknameResult.Nickname;
        var updateResult = await _userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            return BadRequest(new { errors = updateResult.Errors.Select(error => error.Description) });
        }

        var roles = await _userManager.GetRolesAsync(user);
        return Ok(new UserDto(user.Id, user.Email!, user.Nickname, user.FullName, user.ChessRating, user.FideId, roles.ToList()));
    }

    private async Task<(string? Nickname, string? Error)> ResolveNicknameAsync(string? requestedNickname, Guid excludeUserId)
    {
        if (string.IsNullOrWhiteSpace(requestedNickname))
        {
            return (null, null);
        }

        var nickname = requestedNickname.Trim();
        if (nickname.Length > MaxNicknameLength)
        {
            return (null, $"Nickname cannot exceed {MaxNicknameLength} characters.");
        }

        var normalizedNickname = nickname.ToLowerInvariant();
        var nicknameTaken = await _userManager.Users
            .AnyAsync(u => u.Id != excludeUserId && u.Nickname != null && u.Nickname.ToLower() == normalizedNickname);

        if (nicknameTaken)
        {
            return (null, "This nickname is already taken.");
        }

        return (nickname, null);
    }

    private static bool IsValidEmail(string email)
    {
        try
        {
            var address = new System.Net.Mail.MailAddress(email);
            return address.Address == email;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
