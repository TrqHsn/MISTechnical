using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Text;
using System.Collections.Concurrent;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace ADApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class NetworkController : ControllerBase
    {
        private readonly ILogger<NetworkController> _logger;
        private static readonly ConcurrentDictionary<string, Process> _activeProcesses = new();
        private static readonly ConcurrentDictionary<string, CancellationTokenSource> _activeScanners = new();

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

        [HttpGet("scan/stream")]
        public async Task ScanIpRange([FromQuery] string baseIp)
        {
            Response.ContentType = "text/event-stream";
            Response.Headers.Append("Cache-Control", "no-cache");
            Response.Headers.Append("Connection", "keep-alive");

            if (string.IsNullOrWhiteSpace(baseIp))
            {
                await WriteSSE("ERROR:Please enter a valid base IP (first 3 octets)");
                return;
            }

            // Validate base IP format (should be 3 octets)
            var parts = baseIp.Trim().Split('.');
            if (parts.Length != 3 || !parts.All(p => byte.TryParse(p, out _)))
            {
                await WriteSSE("ERROR:Invalid IP format. Please enter exactly 3 octets (e.g., 10.140.8)");
                return;
            }

            var sessionId = Guid.NewGuid().ToString();
            var cts = new CancellationTokenSource();
            _activeScanners[sessionId] = cts;

            try
            {
                await WriteSSE($"SESSION:{sessionId}");
                await WriteSSE($"STATUS:Scanning {baseIp}.0 - {baseIp}.255...");

                var tasks = new List<Task>();
                var semaphore = new SemaphoreSlim(50); // Limit concurrent scans

                for (int i = 0; i <= 255; i++)
                {
                    if (cts.Token.IsCancellationRequested)
                        break;

                    var ip = $"{baseIp}.{i}";
                    var task = Task.Run(async () =>
                    {
                        await semaphore.WaitAsync(cts.Token);
                        try
                        {
                            if (await IsIpActiveAsync(ip, cts.Token))
                            {
                                await WriteSSE($"IP:{ip}");
                            }
                        }
                        finally
                        {
                            semaphore.Release();
                        }
                    }, cts.Token);

                    tasks.Add(task);
                }

                await Task.WhenAll(tasks);
                await WriteSSE("STATUS:Scan completed");
            }
            catch (OperationCanceledException)
            {
                await WriteSSE("STATUS:Scan stopped by user");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during IP scan for {BaseIp}", baseIp);
                await WriteSSE($"ERROR:{ex.Message}");
            }
            finally
            {
                _activeScanners.TryRemove(sessionId, out _);
                cts.Dispose();
            }
        }

        [HttpPost("scan/stop")]
        public IActionResult StopScan([FromBody] StopScanRequest request)
        {
            try
            {
                if (_activeScanners.TryRemove(request.SessionId, out var cts))
                {
                    cts.Cancel();
                    cts.Dispose();
                    return Ok(new { success = true, message = "Scan stopped" });
                }

                return NotFound(new { success = false, message = "No active scan session found" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error stopping scan for session {SessionId}", request.SessionId);
                return StatusCode(500, new { message = ex.Message });
            }
        }

        private async Task<bool> IsIpActiveAsync(string ip, CancellationToken cancellationToken)
        {
            // Try ICMP ping first
            if (await PingAsync(ip, cancellationToken))
                return true;

            // If ping fails, try common TCP ports
            var ports = new[] { 80, 443, 3389 };
            foreach (var port in ports)
            {
                if (cancellationToken.IsCancellationRequested)
                    return false;

                if (await TcpCheckAsync(ip, port, cancellationToken))
                    return true;
            }

            return false;
        }

        private async Task<bool> PingAsync(string ip, CancellationToken cancellationToken)
        {
            try
            {
                using var ping = new Ping();
                var reply = await ping.SendPingAsync(ip, 1000);
                return reply.Status == IPStatus.Success;
            }
            catch
            {
                return false;
            }
        }

        private async Task<bool> TcpCheckAsync(string ip, int port, CancellationToken cancellationToken)
        {
            try
            {
                using var client = new TcpClient();
                var connectTask = client.ConnectAsync(ip, port);
                var timeoutTask = Task.Delay(500, cancellationToken);
                var completedTask = await Task.WhenAny(connectTask, timeoutTask);
                
                if (completedTask == connectTask && client.Connected)
                {
                    return true;
                }
            }
            catch
            {
                // Connection failed
            }
            return false;
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

    public class StopScanRequest
    {
        public string SessionId { get; set; } = string.Empty;
    }
}
