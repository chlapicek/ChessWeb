using System.Security.Claims;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using ChessWeb.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private const int MaxNicknameLength = 100;

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<ApplicationRole> _roleManager;
    private readonly IJwtService _jwtService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        RoleManager<ApplicationRole> roleManager,
        IJwtService jwtService,
        ILogger<AuthController> logger)
    {
        _userManager = userManager;
        _roleManager = roleManager;
        _jwtService = jwtService;
        _logger = logger;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting(AuthRateLimit.RegistrationPolicyName)]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "Email and password are required." });
        }

        var existingUser = await _userManager.FindByEmailAsync(request.Email);
        if (existingUser != null)
        {
            return Conflict(new { message = "A user with this email address already exists." });
        }

        string? nickname = null;
        if (!string.IsNullOrWhiteSpace(request.Nickname))
        {
            nickname = request.Nickname.Trim();
            if (nickname.Length > MaxNicknameLength)
            {
                return BadRequest(new { message = $"Nickname cannot exceed {MaxNicknameLength} characters." });
            }

            var normalizedNickname = nickname.ToLowerInvariant();
            var nicknameTaken = await _userManager.Users.AnyAsync(u => u.Nickname != null && u.Nickname.ToLower() == normalizedNickname);
            if (nicknameTaken)
            {
                return Conflict(new { message = "This nickname is already taken." });
            }
        }

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            FullName = request.FullName,
            Nickname = nickname,
            ChessRating = request.ChessRating,
            FideId = request.FideId,
            EmailConfirmed = true
        };

        var result = await _userManager.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(new { errors = result.Errors.Select(e => e.Description) });
        }

        // Assign RegisteredUser role
        await _userManager.AddToRoleAsync(user, Roles.RegisteredUser);
        var roles = await _userManager.GetRolesAsync(user);

        var token = _jwtService.GenerateToken(user, roles);
        var userDto = new UserDto(user.Id, user.Email, user.Nickname, user.FullName, user.ChessRating, user.FideId, roles.ToList());

        return Ok(new AuthResponse(token.Token, Guid.NewGuid().ToString(), token.ExpiresAt, userDto));
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(AuthRateLimit.LoginPolicyName)]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        var user = await _userManager.FindByEmailAsync(request.EmailOrNickname);
        if (user == null)
        {
            var normalized = request.EmailOrNickname.ToLowerInvariant();
            user = await _userManager.Users.FirstOrDefaultAsync(u => u.Nickname != null && u.Nickname.ToLower() == normalized);
        }

        if (user == null || !await _userManager.CheckPasswordAsync(user, request.Password))
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        user.LastActiveAt = DateTime.UtcNow;
        await _userManager.UpdateAsync(user);

        var roles = await _userManager.GetRolesAsync(user);
        var token = _jwtService.GenerateToken(user, roles);
        var userDto = new UserDto(user.Id, user.Email!, user.Nickname, user.FullName, user.ChessRating, user.FideId, roles.ToList());

        return Ok(new AuthResponse(token.Token, Guid.NewGuid().ToString(), token.ExpiresAt, userDto));
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserDto>> GetCurrentUser()
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

        var roles = await _userManager.GetRolesAsync(user);
        return Ok(new UserDto(user.Id, user.Email!, user.Nickname, user.FullName, user.ChessRating, user.FideId, roles.ToList()));
    }

    [HttpGet("users")]
    [Authorize(Roles = Roles.Admin + "," + Roles.SuperAdmin)]
    public async Task<ActionResult<IEnumerable<UserDto>>> GetAllUsers()
    {
        var users = await _userManager.Users.ToListAsync();
        var result = new List<UserDto>();

        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            result.Add(new UserDto(user.Id, user.Email ?? string.Empty, user.Nickname, user.FullName, user.ChessRating, user.FideId, roles.ToList()));
        }

        return Ok(result);
    }

    [HttpPost("change-roles")]
    [Authorize(Roles = Roles.Admin + "," + Roles.SuperAdmin)]
    public async Task<IActionResult> ChangeUserRoles([FromBody] ChangeRoleRequest request)
    {
        var user = await _userManager.FindByIdAsync(request.UserId.ToString());
        if (user == null)
        {
            return NotFound(new { message = "User not found." });
        }

        var validRoles = request.Roles.Where(r => Roles.AllRoles.Contains(r)).ToList();
        if (validRoles.Count != request.Roles.Count)
        {
            return BadRequest(new { message = "The role list contains an unknown role." });
        }

        var currentUserIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(currentUserIdStr, out var currentUserId) && currentUserId == request.UserId && !validRoles.Contains(Roles.Admin))
        {
            return BadRequest(new { message = "You cannot remove your own Admin role." });
        }

        var currentRoles = await _userManager.GetRolesAsync(user);
        var targetHasSuperAdmin = currentRoles.Contains(Roles.SuperAdmin);
        var requestsSuperAdmin = validRoles.Contains(Roles.SuperAdmin);

        if (targetHasSuperAdmin != requestsSuperAdmin)
        {
            var callerIsSuperAdmin = User.IsInRole(Roles.SuperAdmin);
            if (!callerIsSuperAdmin)
            {
                return Forbid();
            }

            if (targetHasSuperAdmin && !requestsSuperAdmin &&
                Guid.TryParse(currentUserIdStr, out var callerId) && callerId == request.UserId)
            {
                return BadRequest(new { message = "You cannot remove your own SuperAdmin role." });
            }

            if (requestsSuperAdmin && !targetHasSuperAdmin)
            {
                var existingSuperAdmins = await _userManager.GetUsersInRoleAsync(Roles.SuperAdmin);
                if (existingSuperAdmins.Any(u => u.Id != request.UserId))
                {
                    return Conflict(new { message = "Only one SuperAdmin can exist. Remove it from the current holder first." });
                }
            }
        }

        var removeResult = await _userManager.RemoveFromRolesAsync(user, currentRoles);
        if (!removeResult.Succeeded)
        {
            return BadRequest(new { errors = removeResult.Errors.Select(error => error.Description) });
        }

        var addResult = await _userManager.AddToRolesAsync(user, validRoles);
        if (!addResult.Succeeded)
        {
            await _userManager.AddToRolesAsync(user, currentRoles);
            return BadRequest(new { errors = addResult.Errors.Select(error => error.Description) });
        }

        return Ok(new { message = "Roles updated successfully.", roles = validRoles });
    }
}
