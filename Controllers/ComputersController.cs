using Microsoft.AspNetCore.Mvc;
using ADApi.Services;
using ADApi.Models;

namespace ADApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ComputersController : ControllerBase
{
    private readonly IActiveDirectoryService _adService;
    private readonly ILogger<ComputersController> _logger;

    public ComputersController(IActiveDirectoryService adService, ILogger<ComputersController> logger)
    {
        _adService = adService;
        _logger = logger;
    }

    /// <summary>
    /// Search computers by name
    /// </summary>
    /// <param name="searchTerm">Search term to find computers</param>
    /// <returns>List of matching computers</returns>
    [HttpGet("search")]
    public async Task<ActionResult<List<ComputerDto>>> SearchComputers([FromQuery] string searchTerm)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(searchTerm))
            {
                return BadRequest("Search term cannot be empty");
            }

            var computers = await _adService.SearchComputersByNameAsync(searchTerm);
            return Ok(computers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching computers");
            return StatusCode(500, new { error = "An error occurred while searching computers", message = ex.Message });
        }
    }

    /// <summary>
    /// Search computers by description
    /// </summary>
    /// <param name="searchTerm">Search term to find computers by description</param>
    /// <returns>List of matching computers</returns>
    [HttpGet("search/description")]
    public async Task<ActionResult<List<ComputerDto>>> SearchComputersByDescription([FromQuery] string searchTerm)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(searchTerm))
            {
                return BadRequest("Search term cannot be empty");
            }

            var computers = await _adService.SearchComputersByDescriptionAsync(searchTerm);
            return Ok(computers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching computers by description");
            return StatusCode(500, new { error = "An error occurred while searching computers", message = ex.Message });
        }
    }

    /// <summary>
    /// Get computer details by name
    /// </summary>
    /// <param name="computerName">Computer name</param>
    /// <returns>Computer details</returns>
    [HttpGet("{computerName}")]
    public async Task<ActionResult<ComputerDto>> GetComputer(string computerName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(computerName))
            {
                return BadRequest("Computer name cannot be empty");
            }

            var computer = await _adService.GetComputerByNameAsync(computerName);
            
            if (computer == null)
            {
                return NotFound($"Computer with name '{computerName}' not found");
            }

            return Ok(computer);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting computer");
            return StatusCode(500, new { error = "An error occurred while getting computer", message = ex.Message });
        }
    }
}


