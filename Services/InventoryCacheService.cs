using System.Net.Http.Headers;

namespace ADApi.Services;

public sealed class InventoryCacheService : IHostedService
{
    private const string InventoryUrl = "http://sdlportal.dewhirst.grp/inventory/csv.php?type=all";
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<InventoryCacheService> _logger;

    public InventoryCacheService(
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment environment,
        ILogger<InventoryCacheService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _environment = environment;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var inventoryDirectory = Path.Combine(_environment.ContentRootPath, "wwwroot", "inventory");
        var inventoryPath = Path.Combine(inventoryDirectory, "inventory.csv");
        var temporaryPath = Path.Combine(inventoryDirectory, $"inventory.{Guid.NewGuid():N}.tmp");

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
            _logger.LogInformation("Inventory CSV cached at {InventoryPath}", inventoryPath);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Inventory cache refresh was cancelled during application shutdown");
        }
        catch (Exception ex)
        {
            if (File.Exists(temporaryPath))
            {
                File.Delete(temporaryPath);
            }

            _logger.LogError(ex, "Could not refresh the inventory CSV from {InventoryUrl}", InventoryUrl);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
