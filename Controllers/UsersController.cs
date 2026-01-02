using Microsoft.AspNetCore.Mvc;
using ADApi.Services;
using ADApi.Models;

namespace ADApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly IActiveDirectoryService _adService;
    private readonly ILogger<UsersController> _logger;

    public UsersController(IActiveDirectoryService adService, ILogger<UsersController> logger)
    {
        _adService = adService;
        _logger = logger;
    }

    /// <summary>
    /// Search users by name, display name, or SAM account name
    /// </summary>
    /// <param name="searchTerm">Search term to find users</param>
    /// <returns>List of matching users</returns>
    [HttpGet("search")]
    public async Task<ActionResult<List<UserDto>>> SearchUsers([FromQuery] string searchTerm)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(searchTerm))
            {
                return BadRequest("Search term cannot be empty");
            }

            var users = await _adService.SearchUsersByNameAsync(searchTerm);
            return Ok(users);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching users");
            return StatusCode(500, new { error = "An error occurred while searching users", message = ex.Message });
        }
    }

    /// <summary>
    /// Get user details by SAM account name
    /// </summary>
    /// <param name="samAccountName">SAM account name (username)</param>
    /// <returns>User details</returns>
    [HttpGet("{samAccountName}")]
    public async Task<ActionResult<UserDto>> GetUser(string samAccountName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(samAccountName))
            {
                return BadRequest("SAM account name cannot be empty");
            }

            var user = await _adService.GetUserBySamAccountNameAsync(samAccountName);
            
            if (user == null)
            {
                return NotFound($"User with SAM account name '{samAccountName}' not found");
            }

            return Ok(user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting user");
            return StatusCode(500, new { error = "An error occurred while getting user", message = ex.Message });
        }
    }

    /// <summary>
    /// Update attributes for a user identified by userPrincipalName (UPN)
    /// </summary>
    /// <param name="userPrincipalName">User Principal Name (UPN)</param>
    /// <param name="updateDto">Fields to update (department, title, manager)</param>
    [HttpPut("{userPrincipalName}/attributes")]
    public async Task<IActionResult> UpdateUserAttributes(string userPrincipalName, [FromBody] UpdateUserDto updateDto)
    {
        try
        {
            await _adService.UpdateUserAttributesByUserPrincipalNameAsync(userPrincipalName, updateDto);
            return Ok();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating user attributes for {userPrincipalName}", userPrincipalName);
            return StatusCode(500, new { error = "An error occurred while updating user attributes", message = ex.Message });
        }
    }

    /// <summary>
    /// Resolve manager displayName to matching users (exact match)
    /// </summary>
    [HttpGet("resolve-manager")]
    public async Task<ActionResult<List<UserDto>>> ResolveManager([FromQuery] string displayName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(displayName)) return BadRequest("displayName required");
            var matches = await _adService.FindUsersByDisplayNameAsync(displayName);
            return Ok(matches);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resolving manager displayName {displayName}", displayName);
            return StatusCode(500, new { error = "An error occurred while resolving manager", message = ex.Message });
        }
    }

    /// <summary>
    /// Unlock all currently locked user accounts in AD
    /// </summary>
    /// <returns>Lists of unlocked SAM account names and failures</returns>
    [HttpPost("unlock-all")]
    public async Task<ActionResult<UnlockResultDto>> UnlockAllLockedUsers()
    {
        try
        {
            var result = await _adService.UnlockAllLockedUsersAsync();
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error unlocking users");
            return StatusCode(500, new { error = "An error occurred while unlocking users", message = ex.Message });
        }
    }
}


