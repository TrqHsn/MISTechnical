using System.DirectoryServices;
using ADApi.Models;

namespace ADApi.Services;

public class ActiveDirectoryService : IActiveDirectoryService
{
    private readonly string _domainPath;

    public ActiveDirectoryService()
    {
        // Get the current domain
        var domain = System.DirectoryServices.ActiveDirectory.Domain.GetCurrentDomain();
        _domainPath = $"LDAP://{domain.Name}";
    }

    public async Task<List<UserDto>> SearchUsersByNameAsync(string searchTerm)
    {
        return await Task.Run(() =>
        {
            var users = new List<UserDto>();
            
            try
            {
                using var entry = new DirectoryEntry(_domainPath);
                using var searcher = new DirectorySearcher(entry)
                {
                    Filter = $"(&(objectClass=user)(objectCategory=person)(|(Name=*{searchTerm}*)(DisplayName=*{searchTerm}*)(sAMAccountName=*{searchTerm}*)(userPrincipalName=*{searchTerm}*)))",
                    SearchScope = SearchScope.Subtree
                };

                searcher.PropertiesToLoad.AddRange(new[]
                {
                    "sAMAccountName", "displayName", "userPrincipalName", "title", 
                    "department", "company","physicalDeliveryOfficeName", "manager", "userAccountControl"
                });

                var results = searcher.FindAll();

                foreach (SearchResult result in results)
                {
                    var user = MapToUserDto(result);
                    if (user != null)
                        users.Add(user);
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Error searching users: {ex.Message}", ex);
            }

            return users;
        });
    }

    public async Task<UserDto?> GetUserBySamAccountNameAsync(string samAccountName)
    {
        return await Task.Run(() =>
        {
            try
            {
                using var entry = new DirectoryEntry(_domainPath);
                using var searcher = new DirectorySearcher(entry)
                {
                    Filter = $"(&(objectClass=user)(objectCategory=person)(sAMAccountName={samAccountName}))",
                    SearchScope = SearchScope.Subtree
                };

                searcher.PropertiesToLoad.AddRange(new[]
                {
                    "sAMAccountName", "displayName", "userPrincipalName", "title", 
                    "department", "company", "physicalDeliveryOfficeName", "manager", "userAccountControl"
                });

                var result = searcher.FindOne();
                return result != null ? MapToUserDto(result) : null;
            }
            catch (Exception ex)
            {
                throw new Exception($"Error getting user: {ex.Message}", ex);
            }
        });
    }

    public async Task<List<ComputerDto>> SearchComputersByNameAsync(string searchTerm)
    {
        return await Task.Run(() =>
        {
            var computers = new List<ComputerDto>();

            try
            {
                using var entry = new DirectoryEntry(_domainPath);
                using var searcher = new DirectorySearcher(entry)
                {
                    Filter = $"(&(objectClass=computer)(|(Name=*{searchTerm}*)(description=*{searchTerm}*)))",
                    SearchScope = SearchScope.Subtree
                };

                searcher.PropertiesToLoad.AddRange(new[]
                {
                    "name", "description", "operatingSystem"
                });

                var results = searcher.FindAll();

                foreach (SearchResult result in results)
                {
                    var computer = MapToComputerDto(result);
                    if (computer != null)
                        computers.Add(computer);
                }
            }
            catch (Exception ex)
            {
                throw new Exception($"Error searching computers: {ex.Message}", ex);
            }

            return computers;
        });
    }

    public async Task<ComputerDto?> GetComputerByNameAsync(string computerName)
    {
        return await Task.Run(() =>
        {
            try
            {
                using var entry = new DirectoryEntry(_domainPath);
                using var searcher = new DirectorySearcher(entry)
                {
                    Filter = $"(&(objectClass=computer)(Name={computerName}))",
                    SearchScope = SearchScope.Subtree
                };

                searcher.PropertiesToLoad.AddRange(new[]
                {
                    "name", "description", "operatingSystem"
                });

                var result = searcher.FindOne();
                return result != null ? MapToComputerDto(result) : null;
            }
            catch (Exception ex)
            {
                throw new Exception($"Error getting computer: {ex.Message}", ex);
            }
        });
    }

    public async Task UpdateComputerDescriptionAsync(string computerName, string description)
    {
        await Task.Run(() =>
        {
            try
            {
                using var entry = new DirectoryEntry(_domainPath);
                using var searcher = new DirectorySearcher(entry)
                {
                    Filter = $"(&(objectClass=computer)(Name={computerName}))",
                    SearchScope = SearchScope.Subtree
                };

                var result = searcher.FindOne();
                if (result == null)
                {
                    throw new Exception($"Computer '{computerName}' not found");
                }

                using var computerEntry = result.GetDirectoryEntry();
                computerEntry.Properties["description"].Clear();
                if (!string.IsNullOrEmpty(description))
                {
                    computerEntry.Properties["description"].Add(description);
                }
                computerEntry.CommitChanges();
            }
            catch (Exception ex)
            {
                throw new Exception($"Error updating computer description: {ex.Message}", ex);
            }
        });
    }

    public async Task<Dictionary<string, int>> GetLastDeviceNumbersAsync()
    {
        return await Task.Run(() =>
        {
            var result = new Dictionary<string, int>
            {
                { "SDLL", 0 },
                { "SDLD", 0 },
                { "DBOL", 0 }
            };

            try
            {
                using var entry = new DirectoryEntry(_domainPath);
                using var searcher = new DirectorySearcher(entry)
                {
                    Filter = "(&(objectClass=computer))",
                    SearchScope = SearchScope.Subtree
                };

                searcher.PropertiesToLoad.Add("name");

                var computerNames = new List<string>();
                var searchResults = searcher.FindAll();

                foreach (SearchResult searchResult in searchResults)
                {
                    if (searchResult.Properties["name"].Count > 0)
                    {
                        var name = searchResult.Properties["name"][0]?.ToString();
                        if (!string.IsNullOrEmpty(name))
                            computerNames.Add(name);
                    }
                }

                // Regex pattern: PREFIX + NUMBERS + OPTIONAL LETTER
                var regex = new System.Text.RegularExpressions.Regex(@"^([A-Z]+)(\d+)([A-Z]*)$");
                var allowedPrefixes = new[] { "SDLL", "SDLD", "DBOL" };

                // Parse, filter, and group
                var devices = computerNames
                    .Select(name =>
                    {
                        var match = regex.Match(name);
                        if (!match.Success) return null;
                        
                        var prefix = match.Groups[1].Value;
                        if (!allowedPrefixes.Contains(prefix)) return null;
                        
                        return new
                        {
                            Prefix = prefix,
                            Number = int.Parse(match.Groups[2].Value)
                        };
                    })
                    .Where(x => x != null)
                    .GroupBy(x => x.Prefix);

                foreach (var group in devices)
                {
                    var maxNumber = group.Max(x => x.Number);
                    result[group.Key] = maxNumber;
                }

                return result;
            }
            catch (Exception ex)
            {
                throw new Exception($"Error getting last device numbers: {ex.Message}", ex);
            }
        });
    }

    private UserDto? MapToUserDto(SearchResult result)
    {
        try
        {
            var user = new UserDto();

            // sAMAccountName
            if (result.Properties["sAMAccountName"].Count > 0)
                user.SamAccountName = result.Properties["sAMAccountName"][0]?.ToString();

            // displayName
            if (result.Properties["displayName"].Count > 0)
                user.DisplayName = result.Properties["displayName"][0]?.ToString();

            // userPrincipalName
            if (result.Properties["userPrincipalName"].Count > 0)
                user.UserPrincipalName = result.Properties["userPrincipalName"][0]?.ToString();

            // title
            if (result.Properties["title"].Count > 0)
                user.Title = result.Properties["title"][0]?.ToString();

            // department
            if (result.Properties["department"].Count > 0)
                user.Department = result.Properties["department"][0]?.ToString();

            // company
            if (result.Properties["company"].Count > 0)
                user.Company = result.Properties["company"][0]?.ToString();

            // Site
            if (result.Properties["physicalDeliveryOfficeName"].Count > 0)
                user.Site = result.Properties["physicalDeliveryOfficeName"][0]?.ToString();

            // manager - extract CN from DN
            if (result.Properties["manager"].Count > 0)
            {
                var managerDN = result.Properties["manager"][0]?.ToString();
                if (!string.IsNullOrEmpty(managerDN))
                {
                    var cnMatch = System.Text.RegularExpressions.Regex.Match(managerDN, @"CN=([^,]+)");
                    if (cnMatch.Success)
                        user.Manager = cnMatch.Groups[1].Value;
                }
            }

            // enabled status from userAccountControl
            if (result.Properties["userAccountControl"].Count > 0)
            {
                var uac = Convert.ToInt32(result.Properties["userAccountControl"][0]);
                // Check if account is disabled (bit 2)
                user.Enabled = (uac & 0x0002) == 0;
            }

            return user;
        }
        catch
        {
            return null;
        }
    }

    private ComputerDto? MapToComputerDto(SearchResult result)
    {
        try
        {
            var computer = new ComputerDto();

            if (result.Properties["name"].Count > 0)
                computer.Name = result.Properties["name"][0]?.ToString();

            if (result.Properties["description"].Count > 0)
                computer.Description = result.Properties["description"][0]?.ToString();

            if (result.Properties["operatingSystem"].Count > 0)
                computer.OperatingSystem = result.Properties["operatingSystem"][0]?.ToString();
            return computer;
        }
        catch
        {
            return null;
        }
    }
}
