using Microsoft.AspNetCore.Mvc;

namespace ADApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InventoryController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<InventoryController> _logger;

    public InventoryController(IHttpClientFactory httpClientFactory, ILogger<InventoryController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    [HttpGet("csv")]
    public async Task<IActionResult> GetInventoryCsv()
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            var response = await client.GetAsync("http://sdlportal.dewhirst.grp/inventory/csv.php?type=all");
            
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Failed to fetch CSV from portal: {StatusCode}", response.StatusCode);
                return StatusCode((int)response.StatusCode, new { error = "Failed to fetch CSV from portal" });
            }

            var csvContent = await response.Content.ReadAsStringAsync();
            return Content(csvContent, "text/csv");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching inventory CSV");
            return StatusCode(500, new { error = "Internal server error", message = ex.Message });
        }
    }
}
