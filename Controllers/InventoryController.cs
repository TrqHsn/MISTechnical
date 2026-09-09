using ADApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace ADApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InventoryController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;
    private readonly InventoryCacheService _inventoryCacheService;
    private readonly ILogger<InventoryController> _logger;

    public InventoryController(
        IWebHostEnvironment environment,
        InventoryCacheService inventoryCacheService,
        ILogger<InventoryController> logger)
    {
        _environment = environment;
        _inventoryCacheService = inventoryCacheService;
        _logger = logger;
    }

    [HttpGet("csv")]
    public async Task<IActionResult> GetInventoryCsv()
    {
        var inventoryPath = Path.Combine(
            _environment.WebRootPath ?? Path.Combine(_environment.ContentRootPath, "wwwroot"),
            "inventory",
            "inventory.csv");

        try
        {
            if (!System.IO.File.Exists(inventoryPath))
            {
                _logger.LogWarning("Inventory cache file was not found at {InventoryPath}", inventoryPath);
                return NotFound(new { error = "Inventory cache is not available" });
            }

            var stream = new FileStream(
                inventoryPath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read,
                bufferSize: 81920,
                useAsync: true);

            return File(stream, "text/csv", enableRangeProcessing: true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading cached inventory CSV");
            return StatusCode(500, new { error = "Internal server error", message = ex.Message });
        }
    }

    [HttpGet("status")]
    public ActionResult<InventoryCacheStatus> GetInventoryStatus()
    {
        return Ok(_inventoryCacheService.GetStatus());
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<InventoryCacheStatus>> RefreshInventory()
    {
        var status = await _inventoryCacheService.RefreshAsync(HttpContext.RequestAborted);
        return Ok(status);
    }
}
