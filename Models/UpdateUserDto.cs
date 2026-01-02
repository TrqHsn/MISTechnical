namespace ADApi.Models;

public class UpdateUserDto
{
    public string? Department { get; set; }
    public string? Title { get; set; }
    // We'll set Description = Title when Title is provided
    public string? Description { get; set; }
    // Manager provided as User Principal Name (UPN), sAMAccountName, or DisplayName - service will resolve to DN
    public string? Manager { get; set; }
}