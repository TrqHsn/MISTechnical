namespace ADApi.Models.Security;

public sealed class AuthSession
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public required string UserId { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public required DateTimeOffset OriginalExpiresAtUtc { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
}

public sealed class AuthRefreshToken
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public required string SessionId { get; set; }
    public required string TokenHash { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public required DateTimeOffset ExpiresAtUtc { get; set; }
    public DateTimeOffset? ConsumedAtUtc { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public string? ReplacedByTokenId { get; set; }
}

public sealed class ComponentPermission
{
    public required string Id { get; set; }
    public required string Description { get; set; }
}

public sealed class RoleComponentPermission
{
    public required string RoleId { get; set; }
    public required string PermissionId { get; set; }
    public required string Level { get; set; }
}

public sealed class UserComponentPermission
{
    public required string UserId { get; set; }
    public required string PermissionId { get; set; }
    public required string Level { get; set; }
}

public sealed class LoginHistoryEntry
{
    public long Id { get; set; }
    public string? UserId { get; set; }
    public required string Username { get; set; }
    public bool Succeeded { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string? RemoteAddress { get; set; }
}

public sealed class AuditLogEntry
{
    public long Id { get; set; }
    public string? ActorUserId { get; set; }
    public string? TargetUserId { get; set; }
    public required string Action { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string? Details { get; set; }
}
