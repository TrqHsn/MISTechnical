using ADApi.Models;

namespace ADApi.Services;

public interface IActiveDirectoryService
{
    Task<List<UserDto>> SearchUsersByNameAsync(string searchTerm);
    Task<UserDto?> GetUserBySamAccountNameAsync(string samAccountName);
    Task<List<ComputerDto>> SearchComputersByNameAsync(string searchTerm);
    Task<ComputerDto?> GetComputerByNameAsync(string computerName);
    Task UpdateComputerDescriptionAsync(string computerName, string description);
    Task<Dictionary<string, int>> GetLastDeviceNumbersAsync();

    // Unlock all locked user accounts in AD. Returns lists of unlocked and failures.
    Task<ADApi.Models.UnlockResultDto> UnlockAllLockedUsersAsync();
}


