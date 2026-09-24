using ChessWeb.Data;
using ChessWeb.Domain.Entities;
using ChessWeb.Domain.Enums;
using ChessWeb.DTOs;
using ChessWeb.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ChessWeb.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PartnersController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IFileStorageService _fileStorage;

    public PartnersController(ApplicationDbContext context, IFileStorageService fileStorage)
    {
        _context = context;
        _fileStorage = fileStorage;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<ActionResult<IEnumerable<Partner>>> GetPartners()
    {
        var partners = await _context.Partners
            .AsNoTracking()
            .Where(p => p.IsActive)
            .OrderBy(p => p.DisplayOrder)
            .ThenBy(p => p.Name)
            .ToListAsync();

        return Ok(partners);
    }

    [HttpPost]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<Partner>> AddPartner([FromBody] Partner partner)
    {
        if (string.IsNullOrWhiteSpace(partner.Name))
        {
            return BadRequest(new { message = "Partner name is required." });
        }

        if (!Uri.TryCreate(partner.Url, UriKind.Absolute, out var partnerUri) ||
            (partnerUri.Scheme != Uri.UriSchemeHttp && partnerUri.Scheme != Uri.UriSchemeHttps))
        {
            return BadRequest(new { message = "Partner URL must be a valid HTTP/HTTPS link." });
        }

        if (!string.IsNullOrWhiteSpace(partner.LogoUrl) &&
            (!Uri.TryCreate(partner.LogoUrl, UriKind.Absolute, out var logoUri) ||
             (logoUri.Scheme != Uri.UriSchemeHttp && logoUri.Scheme != Uri.UriSchemeHttps)))
        {
            return BadRequest(new { message = "Logo URL must be a valid HTTP/HTTPS link." });
        }

        partner.Id = Guid.NewGuid();
        partner.DisplayOrder = await _context.Partners.CountAsync();
        partner.CreatedAt = DateTime.UtcNow;

        _context.Partners.Add(partner);
        await _context.SaveChangesAsync();

        return Ok(partner);
    }

    [HttpPost("upload")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<Partner>> UploadPartnerLogo(
        [FromForm] string name,
        [FromForm] string url,
        [FromForm] IFormFile? logoFile,
        [FromForm] bool isActive = true)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return BadRequest(new { message = "Partner name is required." });
        }

        if (!Uri.TryCreate(url, UriKind.Absolute, out var partnerUri) ||
            (partnerUri.Scheme != Uri.UriSchemeHttp && partnerUri.Scheme != Uri.UriSchemeHttps))
        {
            return BadRequest(new { message = "Partner URL must be a valid HTTP/HTTPS link." });
        }

        if (logoFile == null || logoFile.Length == 0)
        {
            return BadRequest(new { message = "A partner logo image is required." });
        }

        string storedFileName;
        try
        {
            (storedFileName, _, _) = await _fileStorage.SaveFileAsync(logoFile, "partners");
        }
        catch (Exception ex)
        {
            return BadRequest(new { message = $"Error with file '{logoFile.FileName}': {ex.Message}" });
        }

        var partner = new Partner
        {
            Id = Guid.NewGuid(),
            Name = name.Trim(),
            Url = url.Trim(),
            LogoUrl = $"/api/partners/{Guid.Empty}/logo",
            LogoFileName = storedFileName,
            IsActive = isActive,
            DisplayOrder = await _context.Partners.CountAsync(),
            CreatedAt = DateTime.UtcNow
        };

        partner.LogoUrl = $"/api/partners/{partner.Id}/logo";

        _context.Partners.Add(partner);
        await _context.SaveChangesAsync();

        return Ok(partner);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<ActionResult<Partner>> UpdatePartner(
        Guid id,
        [FromForm] string name,
        [FromForm] string url,
        [FromForm] IFormFile? logoFile,
        [FromForm] bool isActive = true)
    {
        var partner = await _context.Partners.FirstOrDefaultAsync(p => p.Id == id);
        if (partner == null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            return BadRequest(new { message = "Partner name is required." });
        }

        if (!Uri.TryCreate(url, UriKind.Absolute, out var partnerUri) ||
            (partnerUri.Scheme != Uri.UriSchemeHttp && partnerUri.Scheme != Uri.UriSchemeHttps))
        {
            return BadRequest(new { message = "Partner URL must be a valid HTTP/HTTPS link." });
        }

        string? replacementFileName = null;
        if (logoFile is { Length: > 0 })
        {
            try
            {
                var (storedFileName, _, _) = await _fileStorage.SaveFileAsync(logoFile, "partners");
                replacementFileName = storedFileName;
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = $"Error with file '{logoFile.FileName}': {ex.Message}" });
            }
        }

        partner.Name = name.Trim();
        partner.Url = url.Trim();
        partner.IsActive = isActive;
        if (replacementFileName != null)
        {
            var oldFileName = partner.LogoFileName;
            partner.LogoFileName = replacementFileName;
            partner.LogoUrl = $"/api/partners/{partner.Id}/logo";
            if (!string.IsNullOrWhiteSpace(oldFileName))
            {
                await _fileStorage.DeleteFileAsync(oldFileName, "partners");
            }
        }

        await _context.SaveChangesAsync();
        return Ok(partner);
    }

    [HttpPost("reorder")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> ReorderPartners([FromBody] PartnerReorderDto request)
    {
        var partners = await _context.Partners
            .Where(partner => partner.IsActive)
            .ToListAsync();
        if (request.PartnerIds == null || request.PartnerIds.Count != partners.Count ||
            request.PartnerIds.Distinct().Count() != request.PartnerIds.Count ||
            request.PartnerIds.Any(id => partners.All(partner => partner.Id != id)))
        {
            return BadRequest(new { message = "The reorder list must contain every partner exactly once." });
        }

        var positions = request.PartnerIds
            .Select((id, index) => new { id, index })
            .ToDictionary(item => item.id, item => item.index);
        foreach (var partner in partners)
        {
            partner.DisplayOrder = positions[partner.Id];
        }

        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("{id:guid}/logo")]
    [AllowAnonymous]
    public async Task<IActionResult> GetPartnerLogo(Guid id)
    {
        var partner = await _context.Partners.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
        if (partner == null)
        {
            return NotFound();
        }

        if (string.IsNullOrWhiteSpace(partner.LogoFileName))
        {
            if (Uri.TryCreate(partner.LogoUrl, UriKind.Absolute, out var externalLogo) &&
                (externalLogo.Scheme == Uri.UriSchemeHttp || externalLogo.Scheme == Uri.UriSchemeHttps))
            {
                return Redirect(partner.LogoUrl);
            }

            return NotFound();
        }

        var (stream, contentType, _) = await _fileStorage.GetFileAsync(partner.LogoFileName, "partners");
        if (stream == null)
        {
            if (Uri.TryCreate(partner.LogoUrl, UriKind.Absolute, out var externalLogo) &&
                (externalLogo.Scheme == Uri.UriSchemeHttp || externalLogo.Scheme == Uri.UriSchemeHttps))
            {
                return Redirect(partner.LogoUrl);
            }

            return NotFound(new { message = "Logo file missing from storage." });
        }

        return File(stream, contentType, partner.LogoFileName);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = Roles.Admin)]
    public async Task<IActionResult> DeletePartner(Guid id)
    {
        var partner = await _context.Partners.FindAsync(id);
        if (partner == null)
        {
            return NotFound();
        }

        if (!string.IsNullOrWhiteSpace(partner.LogoFileName))
        {
            await _fileStorage.DeleteFileAsync(partner.LogoFileName, "partners");
        }

        _context.Partners.Remove(partner);
        await _context.SaveChangesAsync();

        return NoContent();
    }
}
