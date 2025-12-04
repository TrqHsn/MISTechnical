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
}


