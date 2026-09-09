namespace ADApi.Models;

public sealed class WakeOnLanDevice
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string HostName { get; set; } = string.Empty;
    public string MacAddress { get; set; } = string.Empty;
}

public sealed class CreateWakeOnLanDeviceRequest
{
    public string HostName { get; set; } = string.Empty;
    public string MacAddress { get; set; } = string.Empty;
}