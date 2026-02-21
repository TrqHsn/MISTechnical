using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Text;
using System.Collections.Concurrent;
using System.Net.NetworkInformation;
using System.Net.Sockets;

// For SNMP test endpoint
using Lextm.SharpSnmpLib;
using Lextm.SharpSnmpLib.Messaging;
using System.Net;
using System.Collections.Generic;

namespace ADApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class NetworkController : ControllerBase
    {
        private readonly ILogger<NetworkController> _logger;
        private static readonly ConcurrentDictionary<string, Process> _activeProcesses = new();
        private static readonly ConcurrentDictionary<string, CancellationTokenSource> _activeScanners = new();
        private readonly string _attendanceDeviceCsvPath;

        public NetworkController(ILogger<NetworkController> logger, IWebHostEnvironment env)
        {
            _logger = logger;
            var csvDirectory = Path.Combine(env.ContentRootPath, "MIS", "public", "Attendance device IP");
            Directory.CreateDirectory(csvDirectory);
            _attendanceDeviceCsvPath = Path.Combine(csvDirectory, "Attendance device IP.csv");
            
            // Initialize CSV with headers if it doesn't exist
            if (!System.IO.File.Exists(_attendanceDeviceCsvPath))
            {
                System.IO.File.WriteAllText(_attendanceDeviceCsvPath, "\"Attendance device IP\",\"Location\"\n");
            }
        }

        /// <summary>
        /// Temporary SNMP test endpoint. Returns sysDescr.0 and toner status (if available) from SNMP v2 on the given IP.
        /// </summary>
        [HttpGet("snmp/test")]
        public IActionResult TestSnmp([FromQuery] string ip)
        {
            if (string.IsNullOrWhiteSpace(ip))
                return BadRequest(new { success = false, message = "IP is required" });
            try
            {
                // OIDs: sysDescr.0 and common toner status OIDs (black, cyan, magenta, yellow)
                var oids = new List<Variable>
                {
                    new Variable(new ObjectIdentifier("1.3.6.1.2.1.1.1.0")), // sysDescr.0
                    // Black toner level (Lexmark/HP/Canon common):
                    new Variable(new ObjectIdentifier("1.3.6.1.2.1.43.11.1.1.9.1.1")),
                    // Cyan toner level
                    new Variable(new ObjectIdentifier("1.3.6.1.2.1.43.11.1.1.9.1.2")),
                    // Magenta toner level
                    new Variable(new ObjectIdentifier("1.3.6.1.2.1.43.11.1.1.9.1.3")),
                    // Yellow toner level
                    new Variable(new ObjectIdentifier("1.3.6.1.2.1.43.11.1.1.9.1.4")),
                };

                var result = Messenger.Get(
                    VersionCode.V2,
                    new IPEndPoint(IPAddress.Parse(ip), 161),
                    new OctetString("public"),
                    oids,
                    3000
                );

                // Parse results
                string sysDescr = null;
                int? black = null, cyan = null, magenta = null, yellow = null;
                foreach (var v in result)
                {
                    var oid = v.Id.ToString();
                    switch (oid)
                    {
                        case "1.3.6.1.2.1.1.1.0":
                            sysDescr = v.Data.ToString();
                            break;
                        case "1.3.6.1.2.1.43.11.1.1.9.1.1":
                            black = TryParseInt(v.Data.ToString());
                            break;
                        case "1.3.6.1.2.1.43.11.1.1.9.1.2":
                            cyan = TryParseInt(v.Data.ToString());
                            break;
                        case "1.3.6.1.2.1.43.11.1.1.9.1.3":
                            magenta = TryParseInt(v.Data.ToString());
                            break;
                        case "1.3.6.1.2.1.43.11.1.1.9.1.4":
                            yellow = TryParseInt(v.Data.ToString());
                            break;
                    }
                }

                return Ok(new
                {
                    success = result.Count > 0,
                    sysDescr,
                    toner = new
                    {
                        black,
                        cyan,
                        magenta,
                        yellow
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "SNMP test failed for {IP}", ip);
                return Ok(new { success = false });
            }
        }

        private int? TryParseInt(string s)
        {
            if (int.TryParse(s, out var v)) return v;
            return null;
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

        private async Task WriteSSE(string data)
        {
            await Response.WriteAsync($"data: {data}\n\n");
            await Response.Body.FlushAsync();
        }

        // ============= ATTENDANCE DEVICE ENDPOINTS =============

        [HttpGet("attendance-devices")]
        public async Task<IActionResult> GetAttendanceDevices()
        {
            try
            {
                _logger.LogInformation("GET attendance-devices called. CSV path: {Path}", _attendanceDeviceCsvPath);
                
                if (!System.IO.File.Exists(_attendanceDeviceCsvPath))
                {
                    _logger.LogWarning("CSV file does not exist: {Path}", _attendanceDeviceCsvPath);
                    return Ok(new { devices = new List<AttendanceDevice>() });
                }

                var devices = new List<AttendanceDevice>();
                var lines = await System.IO.File.ReadAllLinesAsync(_attendanceDeviceCsvPath);
                
                _logger.LogInformation("Read {Count} lines from CSV", lines.Length);
                
                // Skip header line
                for (int i = 1; i < lines.Length; i++)
                {
                    var line = lines[i].Trim();
                    if (string.IsNullOrWhiteSpace(line)) continue;

                    var parts = ParseCsvLine(line);
                    if (parts.Length >= 2)
                    {
                        devices.Add(new AttendanceDevice
                        {
                            Ip = parts[0].Trim('"'),
                            Location = parts[1].Trim('"')
                        });
                    }
                }

                _logger.LogInformation("Returning {Count} devices", devices.Count);
                return Ok(new { devices });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error reading attendance devices");
                return StatusCode(500, new { error = "Failed to read attendance devices", message = ex.Message });
            }
        }

        [HttpPost("attendance-devices")]
        public async Task<IActionResult> AddAttendanceDevice([FromBody] AttendanceDevice device)
        {
            try
            {
                _logger.LogInformation("POST attendance-devices called with IP: {Ip}, Location: {Location}", device.Ip, device.Location);
                
                if (string.IsNullOrWhiteSpace(device.Ip) || string.IsNullOrWhiteSpace(device.Location))
                {
                    _logger.LogWarning("IP or Location is missing");
                    return BadRequest(new { error = "IP and Location are required" });
                }

                // Validate IP format
                if (!System.Net.IPAddress.TryParse(device.Ip, out _))
                {
                    _logger.LogWarning("Invalid IP format: {Ip}", device.Ip);
                    return BadRequest(new { error = "Invalid IP address format" });
                }

                // Check if device already exists
                var existingDevices = new List<string>();
                if (System.IO.File.Exists(_attendanceDeviceCsvPath))
                {
                    var lines = await System.IO.File.ReadAllLinesAsync(_attendanceDeviceCsvPath);
                    foreach (var line in lines.Skip(1))
                    {
                        var parts = ParseCsvLine(line);
                        if (parts.Length >= 1 && parts[0].Trim('"') == device.Ip)
                        {
                            _logger.LogWarning("Device with IP {Ip} already exists", device.Ip);
                            return BadRequest(new { error = "Device with this IP already exists" });
                        }
                    }
                }

                // Append to CSV
                var csvLine = $"\"{device.Ip}\",\"{device.Location}\"\n";
                _logger.LogInformation("Appending to CSV: {Line}", csvLine.TrimEnd());
                await System.IO.File.AppendAllTextAsync(_attendanceDeviceCsvPath, csvLine);

                _logger.LogInformation("Device added successfully");
                return Ok(new { success = true, message = "Device added successfully", device });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding attendance device");
                return StatusCode(500, new { error = "Failed to add device", message = ex.Message });
            }
        }

        [HttpDelete("attendance-devices/{ip}")]
        public async Task<IActionResult> DeleteAttendanceDevice(string ip)
        {
            try
            {
                if (!System.IO.File.Exists(_attendanceDeviceCsvPath))
                {
                    return NotFound(new { error = "No devices found" });
                }

                var lines = await System.IO.File.ReadAllLinesAsync(_attendanceDeviceCsvPath);
                var newLines = new List<string> { lines[0] }; // Keep header
                bool found = false;

                for (int i = 1; i < lines.Length; i++)
                {
                    var parts = ParseCsvLine(lines[i]);
                    if (parts.Length >= 1 && parts[0].Trim('"') == ip)
                    {
                        found = true;
                        continue; // Skip this line (delete it)
                    }
                    if (!string.IsNullOrWhiteSpace(lines[i]))
                    {
                        newLines.Add(lines[i]);
                    }
                }

                if (!found)
                {
                    return NotFound(new { error = "Device not found" });
                }

                await System.IO.File.WriteAllLinesAsync(_attendanceDeviceCsvPath, newLines);
                return Ok(new { success = true, message = "Device deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting attendance device {Ip}", ip);
                return StatusCode(500, new { error = "Failed to delete device", message = ex.Message });
            }
        }

        [HttpGet("attendance-devices/check-ports")]
        public async Task<IActionResult> CheckAttendanceDevicePorts()
        {
            try
            {
                if (!System.IO.File.Exists(_attendanceDeviceCsvPath))
                {
                    return Ok(new { results = "", devicesNeedReboot = new List<string>(), allResponding = true });
                }

                var devices = new List<AttendanceDevice>();
                var lines = await System.IO.File.ReadAllLinesAsync(_attendanceDeviceCsvPath);
                
                for (int i = 1; i < lines.Length; i++)
                {
                    var line = lines[i].Trim();
                    if (string.IsNullOrWhiteSpace(line)) continue;

                    var parts = ParseCsvLine(line);
                    if (parts.Length >= 2)
                    {
                        devices.Add(new AttendanceDevice
                        {
                            Ip = parts[0].Trim('"'),
                            Location = parts[1].Trim('"')
                        });
                    }
                }

                if (devices.Count == 0)
                {
                    return Ok(new { results = "No devices to check", devicesNeedReboot = new List<string>(), allResponding = true });
                }

                var ports = new[] { 23, 4370 };
                var resultBuilder = new StringBuilder();
                var devicesNeedReboot = new List<string>();

                // Check each device
                foreach (var device in devices)
                {
                    bool anyPortOpen = false;

                    foreach (var port in ports)
                    {
                        bool isOpen = await TcpCheckAsync(device.Ip, port, CancellationToken.None, timeoutMs: 2000);
                        string status = isOpen ? "OPEN" : "CLOSED";
                        resultBuilder.AppendLine($"Checking {device.Ip} TCP port {port}... {status}");
                        
                        if (isOpen)
                        {
                            anyPortOpen = true;
                        }
                    }

                    // If all ports are closed, device needs reboot
                    if (!anyPortOpen)
                    {
                        devicesNeedReboot.Add(device.Ip);
                    }

                    resultBuilder.AppendLine(); // Empty line between devices
                }

                // Add summary
                if (devicesNeedReboot.Count > 0)
                {
                    resultBuilder.AppendLine("DEVICE(S) NEED REBOOT:");
                    foreach (var ip in devicesNeedReboot)
                    {
                        resultBuilder.AppendLine(ip);
                    }
                }
                else
                {
                    resultBuilder.AppendLine("ALL DEVICES RESPONDING");
                }

                return Ok(new 
                { 
                    results = resultBuilder.ToString(),
                    devicesNeedReboot,
                    allResponding = devicesNeedReboot.Count == 0
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking attendance device ports");
                return StatusCode(500, new { error = "Failed to check ports", message = ex.Message });
            }
        }

        private string[] ParseCsvLine(string line)
        {
            var parts = new List<string>();
            var current = new StringBuilder();
            bool inQuotes = false;

            for (int i = 0; i < line.Length; i++)
            {
                char c = line[i];

                if (c == '"')
                {
                    inQuotes = !inQuotes;
                    current.Append(c);
                }
                else if (c == ',' && !inQuotes)
                {
                    parts.Add(current.ToString());
                    current.Clear();
                }
                else
                {
                    current.Append(c);
                }
            }

            parts.Add(current.ToString());
            return parts.ToArray();
        }

        private async Task<bool> TcpCheckAsync(string ip, int port, CancellationToken cancellationToken, int timeoutMs = 500)
        {
            try
            {
                using var client = new TcpClient();
                var connectTask = client.ConnectAsync(ip, port);
                var timeoutTask = Task.Delay(timeoutMs, cancellationToken);
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

    public class AttendanceDevice
    {
        public string Ip { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;
    }
}
