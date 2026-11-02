using Microsoft.AspNetCore.Identity;

namespace ADApi.Models.Security;

public sealed class ApplicationUser : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAtUtc { get; set; }
}

public sealed class ApplicationRole : IdentityRole
{
    public string Description { get; set; } = string.Empty;
}
