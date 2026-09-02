namespace ADApi.Models;

public class DashboardChecklistItem
{
    public string Id { get; set; } = string.Empty;
    public bool IsCompleted { get; set; }
    public string Task { get; set; } = string.Empty;
    public string CreatedDate { get; set; } = string.Empty;
}

public class DashboardLinkItem
{
    public string Name { get; set; } = string.Empty;
    public string Link { get; set; } = string.Empty;
}

public class DashboardPiDeviceStatus
{
    public string PlantName { get; set; } = string.Empty;
    public string IpAddress { get; set; } = string.Empty;
    public bool IsOnline { get; set; }
    public string StatusText => IsOnline ? "Online" : "Offline";
    public string StatusColor => IsOnline ? "#2ecc71" : "#e74c3c";
}

public class DashboardDataResponse
{
    public List<DashboardChecklistItem> Checklist { get; set; } = new();
    public List<DashboardPiDeviceStatus> PiDevices { get; set; } = new();
    public List<DashboardLinkItem> PortalBookmarks { get; set; } = new();
    public List<DashboardLinkItem> FileList { get; set; } = new();
    public List<DashboardLinkItem> ImportantLinks { get; set; } = new();
    public List<DashboardLinkItem> CiscoMeraki { get; set; } = new();
    public DateTime LastUpdatedUtc { get; set; } = DateTime.UtcNow;
}

public class DashboardFileActionResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? Path { get; set; }
}
