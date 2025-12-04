namespace ADApi.Models;

public class UserDto
{
    public string? SamAccountName { get; set; }
    public string? DisplayName { get; set; }
    public string? UserPrincipalName { get; set; }
    public string? Title { get; set; }
    public string? Department { get; set; }
    public string? Manager { get; set; }
    public bool? Enabled { get; set; }
}


