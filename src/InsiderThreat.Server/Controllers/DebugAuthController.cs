using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace InsiderThreat.Server.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class DebugAuthController : ControllerBase
{
    [HttpGet("claims")]
    public IActionResult GetClaims()
    {
        var claims = User.Claims.Select(c => new { c.Type, c.Value }).ToList();
        var roles = User.FindAll(ClaimTypes.Role).Select(r => r.Value).ToList();
        
        return Ok(new
        {
            Username = User.Identity?.Name,
            IsAuthenticated = User.Identity?.IsAuthenticated,
            AuthenticationType = User.Identity?.AuthenticationType,
            Claims = claims,
            Roles = roles,
            IsAdmin = User.IsInRole("Admin"),
            IsGiamDoc = User.IsInRole("Giám đốc")
        });
    }
}
