using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Runtime.Versioning;

namespace ADApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [SupportedOSPlatform("windows")]
    public class AlertsController : ControllerBase
    {
        private readonly ILogger<AlertsController> _logger;

        public AlertsController(ILogger<AlertsController> logger)
        {
            _logger = logger;
        }

        [HttpPost("send")]
        public async Task<IActionResult> SendAlert([FromBody] SendAlertRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Message))
            {
                return BadRequest(new { error = "Message is required" });
            }

            if (string.IsNullOrWhiteSpace(request.ComputerName) && string.IsNullOrWhiteSpace(request.UserPrincipalName))
            {
                return BadRequest(new { error = "Either ComputerName or UserPrincipalName must be provided" });
            }

            try
            {
                string arguments;
                if (!string.IsNullOrWhiteSpace(request.ComputerName))
                {
                    // Send to specific computer
                    arguments = $"/server:{request.ComputerName} \"{request.Message}\"";
                    if (!string.IsNullOrWhiteSpace(request.UserPrincipalName))
                    {
                        arguments = $"/server:{request.ComputerName} {request.UserPrincipalName} \"{request.Message}\"";
                    }
                }
                else
                {
                    // Send to user (assuming broadcast or find user's computer, but for simplicity, broadcast)
                    arguments = $"{request.UserPrincipalName} \"{request.Message}\"";
                }

                var process = new Process
                {
                    StartInfo = new ProcessStartInfo
                    {
                        FileName = "msg.exe",
                        Arguments = arguments,
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    }
                };

                process.Start();
                await process.WaitForExitAsync();

                if (process.ExitCode != 0)
                {
                    var error = await process.StandardError.ReadToEndAsync();
                    _logger.LogError("msg.exe failed: {Error}", error);
                    return StatusCode(500, new { error = "Failed to send alert", details = error });
                }

                return Ok(new { message = "Alert sent successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending alert");
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }
    }

    public class SendAlertRequest
    {
        public string? ComputerName { get; set; }
        public string? UserPrincipalName { get; set; }
        public string Message { get; set; } = string.Empty;
    }
}