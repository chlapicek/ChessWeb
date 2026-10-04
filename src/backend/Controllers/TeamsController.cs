using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using ChessWeb.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChessWeb.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = Roles.Admin)]
public class TeamsController : ControllerBase
{
    private readonly ITeamService _teamService;

    public TeamsController(ITeamService teamService)
    {
        _teamService = teamService;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<TeamDto>>> GetTeams(CancellationToken cancellationToken)
        => Ok(await _teamService.GetTeamsAsync(cancellationToken));

    [HttpPost]
    public async Task<ActionResult<TeamDto>> CreateTeam(CreateTeamRequest request, CancellationToken cancellationToken)
    {
        var team = await _teamService.CreateTeamAsync(request.Name, cancellationToken);
        return team == null
            ? Conflict(new { message = "Team name is invalid or already exists." })
            : CreatedAtAction(nameof(GetTeams), team);
    }

    [HttpPost("{teamId:guid}/members")]
    public async Task<IActionResult> AddMember(Guid teamId, AssignTeamMemberRequest request, CancellationToken cancellationToken)
    {
        var result = await _teamService.AddMemberAsync(teamId, request.UserId, cancellationToken);
        return result switch
        {
            TeamMembershipResult.Added => Ok(),
            TeamMembershipResult.AlreadyAssigned => Conflict(new { message = "The user is already assigned to this team." }),
            TeamMembershipResult.LimitReached => Conflict(new { message = "A user can belong to at most 3 teams." }),
            TeamMembershipResult.TeamNotFound => NotFound(new { message = "Team not found." }),
            TeamMembershipResult.UserNotFound => NotFound(new { message = "User not found." }),
            _ => BadRequest()
        };
    }

    [HttpDelete("{teamId:guid}/members/{userId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid teamId, Guid userId, CancellationToken cancellationToken)
        => await _teamService.RemoveMemberAsync(teamId, userId, cancellationToken) ? NoContent() : NotFound();

    [HttpPut("{teamId:guid}/captain")]
    public async Task<IActionResult> AssignCaptain(Guid teamId, AssignTeamCaptainRequest request, CancellationToken cancellationToken)
    {
        var result = await _teamService.AssignCaptainAsync(teamId, request.CaptainUserId, cancellationToken);
        return result switch
        {
            TeamCaptainAssignmentResult.Success => NoContent(),
            TeamCaptainAssignmentResult.TeamNotFound => NotFound(new { message = "Team not found." }),
            TeamCaptainAssignmentResult.UserNotMember => BadRequest(new { message = "Captain must be a member of the team." }),
            _ => BadRequest()
        };
    }

    [HttpDelete("{teamId:guid}")]
    public async Task<IActionResult> DeleteTeam(Guid teamId, CancellationToken cancellationToken)
        => await _teamService.DeleteTeamAsync(teamId, cancellationToken) ? NoContent() : NotFound();
}