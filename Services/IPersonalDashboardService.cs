using ADApi.Models;

namespace ADApi.Services;

public interface IPersonalDashboardService
{
    Task<DashboardDataResponse> GetDashboardDataAsync(CancellationToken cancellationToken = default);
    Task<DashboardDataResponse> UpdateChecklistAsync(List<DashboardChecklistItem> checklist, CancellationToken cancellationToken = default);
    Task<DashboardFileActionResult> OpenFileAsync(string path, CancellationToken cancellationToken = default);
}
