using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Serilog.Core;
using Serilog.Events;

namespace ChessWeb.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = Roles.SuperAdmin)]
public class LoggingController : ControllerBase
{
    private static readonly IReadOnlySet<string> ValidLevels = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "Verbose", "Debug", "Information", "Warning", "Error", "Fatal"
    };

    private readonly ApplicationDbContext _context;
    private readonly LoggingLevelSwitch _levelSwitch;

    public LoggingController(ApplicationDbContext context, LoggingLevelSwitch levelSwitch)
    {
        _context = context;
        _levelSwitch = levelSwitch;
    }

    [HttpGet("settings")]
    public async Task<ActionResult<LoggingSettingsDto>> GetSettings()
    {
        var settings = await _context.LoggingSettings.AsNoTracking().FirstOrDefaultAsync();
        if (settings == null)
        {
            return NotFound(new { message = "Logging settings have not been initialized." });
        }

        return Ok(new LoggingSettingsDto(settings.MinimumLevel, settings.RetainedFileCountLimit, settings.UpdatedAt));
    }

    [HttpPut("settings")]
    public async Task<ActionResult<LoggingSettingsDto>> UpdateSettings([FromBody] UpdateLoggingSettingsRequest request)
    {
        if (!ValidLevels.Contains(request.MinimumLevel))
        {
            return BadRequest(new { message = $"MinimumLevel must be one of: {string.Join(", ", ValidLevels)}." });
        }

        if (request.RetainedFileCountLimit is < 1 or > 365)
        {
            return BadRequest(new { message = "RetainedFileCountLimit must be between 1 and 365." });
        }

        var settings = await _context.LoggingSettings.FirstOrDefaultAsync();
        if (settings == null)
        {
            return NotFound(new { message = "Logging settings have not been initialized." });
        }

        settings.MinimumLevel = request.MinimumLevel;
        // Retention only affects newly created rolling log files, not files already retained by the file sink.
        settings.RetainedFileCountLimit = request.RetainedFileCountLimit;
        settings.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _levelSwitch.MinimumLevel = Enum.Parse<LogEventLevel>(request.MinimumLevel, ignoreCase: true);

        return Ok(new LoggingSettingsDto(settings.MinimumLevel, settings.RetainedFileCountLimit, settings.UpdatedAt));
    }
}
