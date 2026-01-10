using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Text;
using System.Collections.Concurrent;

namespace ADApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class NetworkController : ControllerBase
    {
        private readonly ILogger<NetworkController> _logger;
        private static readonly ConcurrentDictionary<string, Process> _activeProcesses = new();

        public NetworkController(ILogger<NetworkController> logger)
        {
            _logger = logger;
        }

        [HttpPost("ping/start")]
        public async Task PingStream([FromBody] PingRequest request)
        {
            Response.ContentType = "text/event-stream";
            Response.Headers.Append("Cache-Control", "no-cache");
            Response.Headers.Append("Connection", "keep-alive");

            if (string.IsNullOrWhiteSpace(request.Address))
            {
                await WriteSSE("❌ Please enter an IP address or hostname\n");
                return;
            }

            var address = request.Address.Trim();
            var sessionId = Guid.NewGuid().ToString();

            try
            {
                // Parse arguments to check for -t flag
                var args = address.Contains("-t") ? address : $"{address} -t";

                var processInfo = new ProcessStartInfo
                {
                    FileName = "ping",
                    Arguments = args,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                var process = new Process { StartInfo = processInfo };

                process.OutputDataReceived += async (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        await WriteSSE(e.Data + "\n");
                    }
                };

                process.ErrorDataReceived += async (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        await WriteSSE($"❌ Error: {e.Data}\n");
                    }
                };

                _activeProcesses[sessionId] = process;
                await WriteSSE($"SESSION:{sessionId}\n");

                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                await process.WaitForExitAsync();

                _activeProcesses.TryRemove(sessionId, out _);
                await WriteSSE("\n--- Ping completed ---\n");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error executing ping for {Address}", request.Address);
                await WriteSSE($"❌ Error: {ex.Message}\n");
            }
        }

        [HttpPost("ping/stop")]
        public IActionResult StopPing([FromBody] StopPingRequest request)
        {
            try
            {
                if (_activeProcesses.TryRemove(request.SessionId, out var process))
                {
                    if (!process.HasExited)
                    {
                        process.Kill(true);
                    }
                    process.Dispose();
                    return Ok(new { success = true, message = "Ping stopped" });
                }

                return NotFound(new { success = false, message = "No active ping session found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error stopping ping for session {SessionId}", request.SessionId);
                return StatusCode(500, new { message = ex.Message });
            }
        }

        private async Task WriteSSE(string data)
        {
            await Response.WriteAsync($"data: {data}\n\n");
            await Response.Body.FlushAsync();
        }
    }

    public class PingRequest
    {
        public string Address { get; set; } = string.Empty;
    }

    public class StopPingRequest
    {
        public string SessionId { get; set; } = string.Empty;
    }
}
