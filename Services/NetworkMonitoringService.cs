using System.Collections.Concurrent;
using System.Net.NetworkInformation;
using System.Text;
using System.Text.Json;

namespace ADApi.Services;

public sealed class NetworkMonitoringService : BackgroundService
{
    private const int FailureThreshold = 5;
    private const int RecoveryThreshold = 5;
    private readonly ILogger<NetworkMonitoringService> _logger;
    private readonly string _serverStoragePath;
    private readonly SemaphoreSlim _serverStorageLock = new(1, 1);
    private readonly ConcurrentDictionary<string, MonitoredServer> _monitoredServers = new();
    private readonly ConcurrentDictionary<string, ServerHealthState> _serverHealthStates = new();

    public sealed record MonitoredServer(string Id, string Name, string Host, bool Maintenance, string? LastDownTime);

    private sealed class ServerHealthState
    {
        public string Status { get; set; } = "green";
        public int ConsecutiveFailures { get; set; }
        public int ConsecutiveSuccesses { get; set; }
        public DateTimeOffset? LastCheckTime { get; set; }
        public string? LastDownTime { get; set; }
    }

    public NetworkMonitoringService(ILogger<NetworkMonitoringService> logger, IWebHostEnvironment environment)
    {
        _logger = logger;
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

    public IReadOnlyList<object> GetServers()
    {
        return _monitoredServers.Values.Select(server =>
        {
            var state = _serverHealthStates.GetOrAdd(server.Id, _ => new ServerHealthState());
            var status = state.Status;

            return (object)new
            {
                id = server.Id,
                name = server.Name,
                host = server.Host,
                maintenance = server.Maintenance,
                lastDownTime = state.LastDownTime ?? server.LastDownTime,
                lastCheckTime = state.LastCheckTime?.ToString("O"),
                lastPingStatus = status == "green" ? "Success" : status == "red" ? "Down" : "Degraded",
                status,
            };
        }).ToList();
    }

    public async Task<MonitoredServer> AddServerAsync(string name, string host)
    {
        var server = new MonitoredServer(Guid.NewGuid().ToString(), name.Trim(), host.Trim(), false, null);
        _monitoredServers[server.Id] = server;
        _serverHealthStates[server.Id] = new ServerHealthState();
        await SaveStoredServersAsync();
        return server;
    }

    public async Task<bool> RemoveServerAsync(string id)
    {
        if (!_monitoredServers.TryRemove(id, out _))
        {
            return false;
        }

        _serverHealthStates.TryRemove(id, out _);
        await SaveStoredServersAsync();
        return true;
    }

    public async Task<MonitoredServer?> UpdateMaintenanceAsync(string id, bool maintenance)
    {
        if (!_monitoredServers.TryGetValue(id, out var existing))
        {
            return null;
        }

        var previousState = _serverHealthStates.GetValueOrDefault(id);
        _monitoredServers[id] = existing with { Maintenance = maintenance };
        _serverHealthStates[id] = new ServerHealthState
        {
            Status = maintenance ? "maintenance" : "green",
            LastDownTime = maintenance ? previousState?.LastDownTime : null,
        };
        await SaveStoredServersAsync();
        return _monitoredServers[id];
    }

    private async Task RunServerMonitorCycleAsync(CancellationToken cancellationToken)
    {
        var checks = _monitoredServers.Values.Select(async server =>
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (server.Maintenance)
            {
                UpdateHealthState(server.Id, true, false);
                return;
            }

            var isOnline = await PingServerAsync(server.Host, cancellationToken);
            UpdateHealthState(server.Id, false, isOnline);
        });

        await Task.WhenAll(checks);
    }

    private void UpdateHealthState(string serverId, bool isMaintenance, bool isOnline)
    {
        if (!_monitoredServers.ContainsKey(serverId))
        {
            return;
        }

        var state = _serverHealthStates.GetOrAdd(serverId, _ => new ServerHealthState());
        state.LastCheckTime = DateTimeOffset.UtcNow;

        if (isMaintenance)
        {
            state.Status = "maintenance";
            state.ConsecutiveFailures = 0;
            state.ConsecutiveSuccesses = 0;
            return;
        }

        if (isOnline)
        {
            state.ConsecutiveFailures = 0;
            state.ConsecutiveSuccesses++;
            state.Status = (state.Status is "yellow" or "red")
                ? state.ConsecutiveSuccesses >= RecoveryThreshold ? "green" : "yellow"
                : "green";
            return;
        }

        state.ConsecutiveSuccesses = 0;
        state.ConsecutiveFailures++;
        state.Status = state.ConsecutiveFailures >= FailureThreshold ? "red" : "yellow";
        if (state.Status == "red" && string.IsNullOrEmpty(state.LastDownTime))
        {
            state.LastDownTime = state.LastCheckTime.Value.ToString("O");
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
                    Status = server.Maintenance ? "maintenance" : "green",
                    LastDownTime = server.LastDownTime,
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
            var serialized = JsonSerializer.Serialize(_monitoredServers.Values, new JsonSerializerOptions { WriteIndented = true });
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
