using Microsoft.AspNetCore.Mvc;
using ADApi.Services;

namespace ADApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DevicesController : ControllerBase
{
    private readonly IActiveDirectoryService _adService;
    private readonly ILogger<DevicesController> _logger;

    public DevicesController(IActiveDirectoryService adService, ILogger<DevicesController> logger)
    {
        _adService = adService;
        _logger = logger;
    }

    /// <summary>
    /// Get the last device numbers for each prefix (SDLL, SDLD, DBOL)
    /// Returns the highest numeric ID for each allowed prefix
    /// </summary>
    /// <returns>Dictionary with highest numbers for each prefix</returns>
    [HttpGet("last")]
    public async Task<ActionResult<Dictionary<string, int>>> GetLastDeviceNumbers()
    {
        try
        {
            var lastDevices = await _adService.GetLastDeviceNumbersAsync();
            return Ok(lastDevices);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting last device numbers");
            return StatusCode(500, new { error = "An error occurred while getting last device numbers", message = ex.Message });
        }
    }
}
