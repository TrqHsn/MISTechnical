using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.RegularExpressions;
using ADApi.Models;

namespace ADApi.Services;

public sealed class WakeOnLanService
{
    private const int WakeOnLanPort = 9;
    private static readonly IPAddress BroadcastAddress = IPAddress.Broadcast;
    private static readonly Regex MacAddressPattern = new("^[0-9A-F]{12}$", RegexOptions.Compiled);
    private readonly string _storagePath;
    private readonly ILogger<WakeOnLanService> _logger;
    private readonly SemaphoreSlim _storageLock = new(1, 1);

    public WakeOnLanService(IWebHostEnvironment environment, ILogger<WakeOnLanService> logger)
    {
        _logger = logger;
        _storagePath = Path.Combine(environment.ContentRootPath, "MIS", "public", "WoL", "network-wol.json");
    }

    public async Task<IReadOnlyList<WakeOnLanDevice>> GetDevicesAsync()
    {
        await _storageLock.WaitAsync();
        try
        {
            return await ReadDevicesAsync();
        }
        finally
        {
            _storageLock.Release();
        }
    }

    public async Task<WakeOnLanDevice> AddDeviceAsync(string hostName, string macAddress)
    {
        var normalizedMac = NormalizeMacAddress(macAddress);
        if (normalizedMac is null)
        {
            throw new ArgumentException("MAC address must contain exactly 12 hexadecimal characters.");
        }

        var trimmedHostName = hostName.Trim();
        if (trimmedHostName.Length == 0)
        {
            throw new ArgumentException("Host name is required.");
        }

        await _storageLock.WaitAsync();
        try
        {
            var devices = await ReadDevicesAsync();
            if (devices.Any(device => device.MacAddress.Equals(normalizedMac, StringComparison.OrdinalIgnoreCase)))
            {
                throw new InvalidOperationException("A device with this MAC address already exists.");
            }

            var device = new WakeOnLanDevice
            {
                HostName = trimmedHostName,
                MacAddress = normalizedMac
            };
            devices.Add(device);
            await WriteDevicesAsync(devices);
            return device;
        }
        finally
        {
            _storageLock.Release();
        }
    }

    public async Task<bool> DeleteDeviceAsync(string id)
    {
        await _storageLock.WaitAsync();
        try
        {
            var devices = await ReadDevicesAsync();
            var removed = devices.RemoveAll(device => device.Id.Equals(id, StringComparison.OrdinalIgnoreCase)) > 0;
            if (removed)
            {
                await WriteDevicesAsync(devices);
            }

            return removed;
        }
        finally
        {
            _storageLock.Release();
        }
    }

    public async Task WakeDeviceAsync(string id)
    {
        WakeOnLanDevice? device;
        await _storageLock.WaitAsync();
        try
        {
            device = (await ReadDevicesAsync()).FirstOrDefault(item =>
                item.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
        }
        finally
        {
            _storageLock.Release();
        }

        if (device is null)
        {
            throw new KeyNotFoundException("Wake-on-LAN device not found.");
        }

        var macBytes = Convert.FromHexString(device.MacAddress.Replace(":", string.Empty));
        var packet = new byte[6 + (macBytes.Length * 16)];
        Array.Fill(packet, (byte)0xFF, 0, 6);
        for (var offset = 6; offset < packet.Length; offset += macBytes.Length)
        {
            macBytes.CopyTo(packet, offset);
        }

        using var client = new UdpClient();
        client.EnableBroadcast = true;
        await client.SendAsync(packet, new IPEndPoint(BroadcastAddress, WakeOnLanPort));
        _logger.LogInformation("Wake-on-LAN packet sent for {HostName} ({MacAddress})", device.HostName, device.MacAddress);
    }

    public static string? NormalizeMacAddress(string? macAddress)
    {
        if (string.IsNullOrWhiteSpace(macAddress))
        {
            return null;
        }

        var normalized = macAddress.Replace(":", string.Empty).Replace("-", string.Empty).Trim().ToUpperInvariant();
        return MacAddressPattern.IsMatch(normalized)
            ? string.Join(":", Enumerable.Range(0, 6).Select(index => normalized.Substring(index * 2, 2)))
            : null;
    }

    private async Task<List<WakeOnLanDevice>> ReadDevicesAsync()
    {
        if (!File.Exists(_storagePath))
        {
            return [];
        }

        try
        {
            await using var stream = File.OpenRead(_storagePath);
            return await JsonSerializer.DeserializeAsync<List<WakeOnLanDevice>>(stream) ?? [];
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Wake-on-LAN storage is invalid. Starting with an empty list.");
            return [];
        }
    }

    private async Task WriteDevicesAsync(List<WakeOnLanDevice> devices)
    {
        var json = JsonSerializer.Serialize(devices, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(_storagePath, json);
    }
}