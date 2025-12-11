using ADApi.Models;

namespace ADApi.Services;

public interface IActiveDirectoryService
{
    Task<List<UserDto>> SearchUsersByNameAsync(string searchTerm);
    Task<UserDto?> GetUserBySamAccountNameAsync(string samAccountName);
    Task<List<ComputerDto>> SearchComputersByNameAsync(string searchTerm);
    Task<ComputerDto?> GetComputerByNameAsync(string computerName);
    Task UpdateComputerDescriptionAsync(string computerName, string description);
}


