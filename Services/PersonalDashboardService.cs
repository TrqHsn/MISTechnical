using System.Diagnostics;
using System.Net.NetworkInformation;
using ADApi.Models;
using ClosedXML.Excel;

namespace ADApi.Services;

public class PersonalDashboardService : IPersonalDashboardService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<PersonalDashboardService> _logger;
    private readonly string _excelFilePath;
    private readonly TimeSpan _refreshInterval = TimeSpan.FromMinutes(10);
    private readonly Dictionary<string, (DateTime CheckedAt, bool IsOnline)> _piStatusCache = new(StringComparer.OrdinalIgnoreCase);

    public PersonalDashboardService(IConfiguration configuration, ILogger<PersonalDashboardService> logger, IWebHostEnvironment environment)
    {
        _configuration = configuration;
        _logger = logger;
        _excelFilePath = ResolveExcelPath(configuration["Dashboard:ExcelFile"], environment);
    }

    public async Task<DashboardDataResponse> GetDashboardDataAsync(CancellationToken cancellationToken = default)
    {
        var workbook = LoadWorkbook();
        var response = new DashboardDataResponse
        {
            Checklist = ReadChecklist(workbook),
            PortalBookmarks = ReadLinkSheet(workbook, "Portal Bookmarks"),
            FileList = ReadLinkSheet(workbook, "File List"),
            ImportantLinks = ReadLinkSheet(workbook, "Important Web Links"),
            CiscoMeraki = ReadLinkSheet(workbook, "Cisco Meraki")
        };

        response.PiDevices = await ReadPiDevicesAsync(workbook, cancellationToken);
        response.LastUpdatedUtc = DateTime.UtcNow;
        return response;
    }

    public Task<DashboardDataResponse> UpdateChecklistAsync(List<DashboardChecklistItem> checklist, CancellationToken cancellationToken = default)
    {
        var workbook = LoadWorkbook();
        var worksheet = EnsureWorksheet(workbook, "Daily Checklist", new[] { "Checked", "Task", "Created Date" });

        worksheet.Clear();
        worksheet.Columns().AdjustToContents();

        worksheet.Cell(1, 1).Value = "Checked";
        worksheet.Cell(1, 2).Value = "Task";
        worksheet.Cell(1, 3).Value = "Created Date";

        for (var index = 0; index < checklist.Count; index++)
        {
            var row = index + 2;
            var item = checklist[index];
            worksheet.Cell(row, 1).Value = item.IsCompleted;
            worksheet.Cell(row, 2).Value = item.Task;
            worksheet.Cell(row, 3).Value = string.IsNullOrWhiteSpace(item.CreatedDate)
                ? DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
                : item.CreatedDate;
        }

        worksheet.Columns().AdjustToContents();
        workbook.SaveAs(_excelFilePath);

        return Task.FromResult(new DashboardDataResponse
        {
            Checklist = checklist.Select(item => new DashboardChecklistItem
            {
                Id = item.Id,
                IsCompleted = item.IsCompleted,
                Task = item.Task,
                CreatedDate = item.CreatedDate
            }).ToList()
        });
    }

    public Task<DashboardFileActionResult> OpenFileAsync(string path, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return Task.FromResult(new DashboardFileActionResult
            {
                Success = false,
                Message = "No file path was provided."
            });
        }

        var resolvedPath = ResolvePath(path);
        if (!File.Exists(resolvedPath))
        {
            return Task.FromResult(new DashboardFileActionResult
            {
                Success = false,
                Message = "The requested file does not exist.",
                Path = resolvedPath
            });
        }

        try
        {
            Process.Start(new ProcessStartInfo(resolvedPath)
            {
                UseShellExecute = true
            });

            return Task.FromResult(new DashboardFileActionResult
            {
                Success = true,
                Message = "File opened successfully.",
                Path = resolvedPath
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to open file {Path}", resolvedPath);
            return Task.FromResult(new DashboardFileActionResult
            {
                Success = false,
                Message = ex.Message,
                Path = resolvedPath
            });
        }
    }

    private async Task<List<DashboardPiDeviceStatus>> ReadPiDevicesAsync(IXLWorkbook workbook, CancellationToken cancellationToken)
    {
        var worksheet = EnsureWorksheet(workbook, "PA Devices", new[] { "Plant Name", "IP Address" });
        var devices = new List<DashboardPiDeviceStatus>();

        var rowCount = worksheet.LastRowUsed()?.RowNumber() ?? 1;
        for (var rowIndex = 2; rowIndex <= rowCount; rowIndex++)
        {
            var row = worksheet.Row(rowIndex);
            var plantName = row.Cell(1).GetString().Trim();
            var ipAddress = row.Cell(2).GetString().Trim();
            if (string.IsNullOrWhiteSpace(plantName) && string.IsNullOrWhiteSpace(ipAddress))
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(ipAddress))
            {
                continue;
            }

            var cached = GetCachedStatus(ipAddress);
            if (cached is null)
            {
                cached = await PingAsync(ipAddress, cancellationToken);
            }

            devices.Add(new DashboardPiDeviceStatus
            {
                PlantName = plantName,
                IpAddress = ipAddress,
                IsOnline = cached.Value.IsOnline
            });
        }

        return devices;
    }

    private (DateTime CheckedAt, bool IsOnline)? GetCachedStatus(string ipAddress)
    {
        if (_piStatusCache.TryGetValue(ipAddress, out var cached) && DateTime.UtcNow - cached.CheckedAt < _refreshInterval)
        {
            return cached;
        }

        return null;
    }

    private async Task<(DateTime CheckedAt, bool IsOnline)> PingAsync(string ipAddress, CancellationToken cancellationToken)
    {
        try
        {
            using var ping = new Ping();
            var reply = await ping.SendPingAsync(ipAddress, 3000);
            var isOnline = reply.Status == IPStatus.Success;
            var status = (DateTime.UtcNow, isOnline);
            _piStatusCache[ipAddress] = status;
            return status;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to ping {IpAddress}", ipAddress);
            var failed = (DateTime.UtcNow, false);
            _piStatusCache[ipAddress] = failed;
            return failed;
        }
    }

    private List<DashboardChecklistItem> ReadChecklist(IXLWorkbook workbook)
    {
        var worksheet = EnsureWorksheet(workbook, "Daily Checklist", new[] { "Checked", "Task", "Created Date" });
        var items = new List<DashboardChecklistItem>();
        var rowCount = worksheet.LastRowUsed()?.RowNumber() ?? 1;

        for (var rowIndex = 2; rowIndex <= rowCount; rowIndex++)
        {
            var row = worksheet.Row(rowIndex);
            var task = row.Cell(2).GetString().Trim();
            var checkedValue = row.Cell(1).Value;
            if (string.IsNullOrWhiteSpace(task) && string.IsNullOrWhiteSpace(row.Cell(3).GetString()))
            {
                continue;
            }

            var isCompleted = false;
            if (row.Cell(1).TryGetValue<bool>(out var boolValue))
            {
                isCompleted = boolValue;
            }
            else if (row.Cell(1).TryGetValue<string>(out var textValue))
            {
                bool.TryParse(textValue, out isCompleted);
            }

            items.Add(new DashboardChecklistItem
            {
                Id = rowIndex.ToString(),
                IsCompleted = isCompleted,
                Task = task,
                CreatedDate = row.Cell(3).TryGetValue<DateTime>(out var createdDate)
                    ? createdDate.ToString("yyyy-MM-dd HH:mm:ss")
                    : row.Cell(3).GetString().Trim()
            });
        }

        return items;
    }

    private List<DashboardLinkItem> ReadLinkSheet(IXLWorkbook workbook, string sheetName)
    {
        var worksheet = EnsureWorksheet(workbook, sheetName, sheetName switch
        {
            "Portal Bookmarks" => new[] { "Button Name", "Link" },
            "File List" => new[] { "Name", "File Path" },
            "Important Web Links" => new[] { "Button Name", "Link" },
            "Cisco Meraki" => new[] { "Button Name", "Link" },
            _ => new[] { "Button Name", "Link" }
        });

        var items = new List<DashboardLinkItem>();
        var rowCount = worksheet.LastRowUsed()?.RowNumber() ?? 1;
        for (var rowIndex = 2; rowIndex <= rowCount; rowIndex++)
        {
            var row = worksheet.Row(rowIndex);
            var name = row.Cell(1).GetString().Trim();
            var link = row.Cell(2).GetString().Trim();
            if (string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(link))
            {
                continue;
            }

            items.Add(new DashboardLinkItem { Name = name, Link = link });
        }

        return items;
    }

    private IXLWorksheet EnsureWorksheet(IXLWorkbook workbook, string sheetName, string[] headers)
    {
        var worksheet = workbook.Worksheets.FirstOrDefault(sheet => sheet.Name.Equals(sheetName, StringComparison.OrdinalIgnoreCase));
        if (worksheet is null)
        {
            worksheet = workbook.AddWorksheet(sheetName);
        }

        if (worksheet.Cell(1, 1).IsEmpty())
        {
            for (var index = 0; index < headers.Length; index++)
            {
                worksheet.Cell(1, index + 1).Value = headers[index];
            }
        }

        return worksheet;
    }

    private XLWorkbook LoadWorkbook()
    {
        if (!File.Exists(_excelFilePath))
        {
            _logger.LogWarning("Dashboard workbook not found at {Path}. Creating a new workbook.", _excelFilePath);
            var workbook = new XLWorkbook();
            EnsureWorksheet(workbook, "Daily Checklist", new[] { "Checked", "Task", "Created Date" });
            EnsureWorksheet(workbook, "PA Devices", new[] { "Plant Name", "IP Address" });
            EnsureWorksheet(workbook, "Portal Bookmarks", new[] { "Button Name", "Link" });
            EnsureWorksheet(workbook, "File List", new[] { "Name", "File Path" });
            EnsureWorksheet(workbook, "Important Web Links", new[] { "Button Name", "Link" });
            EnsureWorksheet(workbook, "Cisco Meraki", new[] { "Button Name", "Link" });
            workbook.SaveAs(_excelFilePath);
            return workbook;
        }

        return new XLWorkbook(_excelFilePath);
    }

    private string ResolveExcelPath(string? configuredPath, IWebHostEnvironment environment)
    {
        var candidate = configuredPath ?? "MIS/public/DashboardData/DashboardData.xlsx";
        if (Path.IsPathRooted(candidate))
        {
            return candidate;
        }

        var fullPath = Path.GetFullPath(Path.Combine(environment.ContentRootPath, candidate));
        var directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        return fullPath;
    }

    private string ResolvePath(string path)
    {
        if (Path.IsPathRooted(path))
        {
            return path;
        }

        return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(_excelFilePath) ?? string.Empty, path));
    }
}
