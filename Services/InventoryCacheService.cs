namespace ADApi.Services;

public sealed class InventoryCacheStatus
{
    public bool FileExists { get; set; }
    public string Source { get; set; } = "none";
    public string Message { get; set; } = "No inventory cache available";
    public DateTimeOffset? LastUpdatedUtc { get; set; }
    public bool IsFromPreviousCache => Source == "cache";
    public bool IsLatest => Source == "server";
}

public sealed class InventoryCacheService : IHostedService
{
    private const string InventoryUrl = "http://sdlportal.dewhirst.grp/inventory/csv.php?type=all";
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<InventoryCacheService> _logger;
    private readonly object _statusLock = new();

    private string _currentSource = "cache";
    private string _currentMessage = "Previous cache";
    private DateTimeOffset? _lastSuccessfulUpdateUtc;

    public InventoryCacheService(
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment environment,
        ILogger<InventoryCacheService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _environment = environment;
        _logger = logger;
    }

    public InventoryCacheStatus GetStatus()
    {
        var inventoryPath = GetInventoryPath();
        var fileExists = File.Exists(inventoryPath);

        lock (_statusLock)
        {
            return new InventoryCacheStatus
            {
                FileExists = fileExists,
                Source = fileExists ? (_currentSource == "server" ? "server" : "cache") : "none",
                Message = fileExists ? _currentMessage : "No inventory cache available",
                LastUpdatedUtc = _lastSuccessfulUpdateUtc,
            };
        }
    }

    public async Task<InventoryCacheStatus> RefreshAsync(CancellationToken cancellationToken = default)
    {
        var inventoryDirectory = GetInventoryDirectory();
        var inventoryPath = GetInventoryPath();
        var temporaryPath = Path.Combine(inventoryDirectory, $"inventory.{Guid.NewGuid():N}.tmp");
        var hadPreviousCache = File.Exists(inventoryPath);

        try
        {
            Directory.CreateDirectory(inventoryDirectory);

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromMinutes(5);
            using var response = await client.GetAsync(
                InventoryUrl,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);

            response.EnsureSuccessStatusCode();

            await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
            await using (var destination = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 81920,
                useAsync: true))
            {
                await source.CopyToAsync(destination, cancellationToken);
            }

            File.Move(temporaryPath, inventoryPath, overwrite: true);

            lock (_statusLock)
            {
                _currentSource = "server";
                _currentMessage = "Server";
                _lastSuccessfulUpdateUtc = DateTimeOffset.UtcNow;
            }

            _logger.LogInformation("Inventory CSV refreshed from {InventoryUrl} and cached at {InventoryPath}", InventoryUrl, inventoryPath);
            return GetStatus();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Inventory cache refresh was cancelled during application shutdown");
            return GetStatus();
        }
        catch (Exception ex)
        {
            if (File.Exists(temporaryPath))
            {
                File.Delete(temporaryPath);
            }

            var previousMessage = hadPreviousCache
                ? "Previous cache"
                : "No inventory cache available";

            lock (_statusLock)
            {
                _currentSource = hadPreviousCache ? "cache" : "none";
                _currentMessage = hadPreviousCache
                    ? $"Previous cache (latest server refresh failed: {ex.Message})"
                    : "No inventory cache available";
            }

            _logger.LogError(ex, "Could not refresh the inventory CSV from {InventoryUrl}; keeping previous cached file when available", InventoryUrl);
            return GetStatus();
        }
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        return RefreshAsync(cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private string GetInventoryDirectory()
    {
        var webRootPath = _environment.WebRootPath;
        if (string.IsNullOrWhiteSpace(webRootPath))
        {
            webRootPath = Path.Combine(_environment.ContentRootPath, "wwwroot");
        }

        return Path.Combine(webRootPath, "inventory");
    }

    private string GetInventoryPath() => Path.Combine(GetInventoryDirectory(), "inventory.csv");
}
