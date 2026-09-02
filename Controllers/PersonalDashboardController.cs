using ADApi.Models;
using ADApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace ADApi.Controllers;

[ApiController]
[Route("api/personal-dashboard")]
public class PersonalDashboardController : ControllerBase
{
    private readonly IPersonalDashboardService _dashboardService;

    public PersonalDashboardController(IPersonalDashboardService dashboardService)
    {
        _dashboardService = dashboardService;
    }

    [HttpGet]
    public async Task<ActionResult<DashboardDataResponse>> GetDashboardData(CancellationToken cancellationToken)
    {
        try
        {
            var data = await _dashboardService.GetDashboardDataAsync(cancellationToken);
            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Unable to load dashboard data", message = ex.Message });
        }
    }

    [HttpPost("checklist")]
    public async Task<ActionResult<DashboardDataResponse>> UpdateChecklist([FromBody] List<DashboardChecklistItem> checklist, CancellationToken cancellationToken)
    {
        try
        {
            var data = await _dashboardService.UpdateChecklistAsync(checklist, cancellationToken);
            return Ok(data);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Unable to update checklist", message = ex.Message });
        }
    }

    [HttpPost("open-file")]
    public async Task<ActionResult<DashboardFileActionResult>> OpenFile([FromBody] OpenFileRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _dashboardService.OpenFileAsync(request.Path, cancellationToken);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Unable to open file", message = ex.Message });
        }
    }

    public class OpenFileRequest
    {
        public string Path { get; set; } = string.Empty;
    }
}
