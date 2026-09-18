using System.Collections.Concurrent;
using System.Net.NetworkInformation;
using System.Text;
using System.Text.Json;
using ADApi.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace ADApi.Services;

public sealed class NetworkMonitoringService : BackgroundService
{
    private const int MaxTargets = 30;
    private const int FailureThreshold = 5;
    private const int RecoverySuccessesToOnline = 4;

    private readonly ILogger<NetworkMonitoringService> _logger;
    private readonly string _serverStoragePath;
    private readonly SemaphoreSlim _serverStorageLock = new(1, 1);
    private readonly ConcurrentDictionary<int, MonitoredServer> _monitoredServers = new();
    private readonly ConcurrentDictionary<int, ServerHealthState> _serverHealthStates = new();
    private readonly IHubContext<NetworkDashboardHub> _hubContext;

    public sealed record MonitoredServer(int Id, string Name, string Host, string? LastDownTime = null);

    public sealed record MonitoredServerDto(
        int Id,
        string Name,
        string Host,
        string Status,
        string? LastCheckTime,
        string? LastDownTime,
        string? LastPingStatus);

    private sealed class ServerHealthState
    {
        public string Status { get; set; } = "CHECKING";
        public int ConsecutiveFailures { get; set; }
        public int ConsecutiveSuccesses { get; set; }
        public DateTimeOffset? LastCheckTime { get; set; }
        public string? LastDownTime { get; set; }
    }

    public NetworkMonitoringService(
        ILogger<NetworkMonitoringService> logger,
        IWebHostEnvironment environment,
        IHubContext<NetworkDashboardHub> hubContext)
    {
        _logger = logger;
        _hubContext = hubContext;
        _serverStoragePath = Path.Combine(environment.ContentRootPath, "network-servers.json");
        LoadStoredServers();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));

        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                await RunServerMonitorCycleAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            _logger.LogInformation("Network monitoring stopped");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Network monitoring loop failed");
        }
    }

    public IReadOnlyList<MonitoredServerDto> GetServers()
    {
        return _monitoredServers.Values
            .OrderBy(server => server.Id)
            .Select(server =>
            {
                var state = _serverHealthStates.GetOrAdd(server.Id, _ => new ServerHealthState());
                var status = state.Status;

                return new MonitoredServerDto(
                    server.Id,
                    server.Name,
                    server.Host,
                    status,
                    state.LastCheckTime?.ToString("O"),
                    state.LastDownTime ?? server.LastDownTime,
                    GetPingStatusLabel(status));
            })
            .ToList();
    }

    public async Task<MonitoredServer?> AddServerAsync(string name, string host)
    {
        var cleanName = name.Trim();
        var cleanHost = host.Trim();

        if (string.IsNullOrWhiteSpace(cleanName) || string.IsNullOrWhiteSpace(cleanHost))
        {
            throw new ArgumentException("Name and host are required.");
        }

        if (_monitoredServers.Count >= MaxTargets)
        {
            throw new InvalidOperationException($"Maximum of {MaxTargets} monitored targets allowed.");
        }

        if (HasDuplicateHost(cleanHost))
        {
            throw new InvalidOperationException("Duplicate host or IP already exists.");
        }

        var nextId = GetNextAvailableId();
        var server = new MonitoredServer(nextId, cleanName, cleanHost, null);
        _monitoredServers[server.Id] = server;
        _serverHealthStates[server.Id] = new ServerHealthState { Status = "CHECKING" };

        await SaveStoredServersAsync();
        await BroadcastStateAsync();
        return server;
    }

    public async Task<bool> RemoveServerAsync(int id)
    {
        if (!_monitoredServers.TryRemove(id, out _))
        {
            return false;
        }

        _serverHealthStates.TryRemove(id, out _);
        await SaveStoredServersAsync();
        await BroadcastStateAsync();
        return true;
    }

    private async Task RunServerMonitorCycleAsync(CancellationToken cancellationToken)
    {
        var checks = _monitoredServers.Values.Select(async server =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            var isOnline = await PingServerAsync(server.Host, cancellationToken);
            UpdateHealthState(server.Id, isOnline);
        });

        await Task.WhenAll(checks);
        await BroadcastStateAsync();
    }

    private void UpdateHealthState(int serverId, bool isOnline)
    {
        if (!_monitoredServers.ContainsKey(serverId))
        {
            return;
        }

        var state = _serverHealthStates.GetOrAdd(serverId, _ => new ServerHealthState());
        state.LastCheckTime = DateTimeOffset.UtcNow;

        if (isOnline)
        {
            state.ConsecutiveFailures = 0;
            state.ConsecutiveSuccesses++;

            if (state.Status == "OFFLINE" || state.Status == "DEGRADE")
            {
                state.Status = state.ConsecutiveSuccesses >= RecoverySuccessesToOnline ? "ONLINE" : "DEGRADE";
            }
            else
            {
                state.Status = "ONLINE";
            }

            return;
        }

        state.ConsecutiveSuccesses = 0;
        state.ConsecutiveFailures++;

        if (state.ConsecutiveFailures >= FailureThreshold)
        {
            state.Status = "OFFLINE";
            state.LastDownTime ??= state.LastCheckTime?.ToString("O");
        }
        else
        {
            state.Status = "DEGRADE";
        }
    }

    private static async Task<bool> PingServerAsync(string host, CancellationToken cancellationToken)
    {
        try
        {
            using var ping = new Ping();
            var reply = await ping.SendPingAsync(host.Trim(), 900).WaitAsync(cancellationToken);
            return reply.Status == IPStatus.Success;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch
        {
            return false;
        }
    }

    private int GetNextAvailableId()
    {
        var nextId = 1;
        while (_monitoredServers.ContainsKey(nextId))
        {
            nextId++;
        }

        return nextId;
    }

    private bool HasDuplicateHost(string host)
    {
        var normalized = NormalizeHost(host);
        return _monitoredServers.Values.Any(server => NormalizeHost(server.Host) == normalized);
    }

    private static string NormalizeHost(string value)
    {
        return value.Trim().TrimEnd('.').ToLowerInvariant();
    }

    private static string GetPingStatusLabel(string status)
    {
        return status switch
        {
            "ONLINE" => "Success",
            "OFFLINE" => "Down",
            "DEGRADE" => "Degraded",
            "CHECKING" => "Checking",
            _ => "Unknown"
        };
    }

    private async Task BroadcastStateAsync()
    {
        await _hubContext.Clients.All.SendAsync("ServersUpdated", GetServers());
    }

    private void LoadStoredServers()
    {
        try
        {
            if (!File.Exists(_serverStoragePath))
            {
                return;
            }

            var raw = File.ReadAllText(_serverStoragePath, Encoding.UTF8);
            var saved = JsonSerializer.Deserialize<List<MonitoredServer>>(raw, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
            });

            if (saved is null)
            {
                return;
            }

            foreach (var server in saved)
            {
                _monitoredServers[server.Id] = server;
                _serverHealthStates[server.Id] = new ServerHealthState
                {
                    Status = "CHECKING",
                    LastDownTime = server.LastDownTime
                };
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to load stored network servers");
        }
    }

    private async Task SaveStoredServersAsync()
    {
        await _serverStorageLock.WaitAsync();
        try
        {
            var payload = _monitoredServers.Values.OrderBy(server => server.Id).ToList();
            var serialized = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(_serverStoragePath, serialized, Encoding.UTF8);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to save stored network servers");
        }
        finally
        {
            _serverStorageLock.Release();
        }
    }
}
