using System.ComponentModel.DataAnnotations;

namespace ADApi.Models.Security.Contracts;

/// <summary>Account fields used when an administrator creates a local application user.</summary>
public sealed record CreateApplicationUserRequest
{
    [Required, StringLength(100, MinimumLength = 1)]
    public required string Username { get; init; }

    [Required, StringLength(200, MinimumLength = 1)]
    public required string DisplayName { get; init; }

    [Required, StringLength(128, MinimumLength = 8)]
    public required string InitialPassword { get; init; }

    [Required]
    public required string Role { get; init; }
}

/// <summary>Editable profile and activation state for an application user.</summary>
public sealed record UpdateApplicationUserRequest
{
    [Required, StringLength(200, MinimumLength = 1)]
    public required string DisplayName { get; init; }

    public required bool IsActive { get; init; }
}

/// <summary>Role assignment for an application user.</summary>
public sealed record AssignApplicationRoleRequest
{
    [Required]
    public required string Role { get; init; }
}

/// <summary>Permission level assigned to a specific user and component.</summary>
public sealed record SetUserComponentPermissionRequest
{
    [Required, RegularExpression("^(None|View|Full)$")]
    public required string Level { get; init; }
}

/// <summary>Permission level assigned to a role and component.</summary>
public sealed record SetRoleComponentPermissionRequest
{
    [Required, RegularExpression("^(None|View|Full)$")]
    public required string Level { get; init; }
}

/// <summary>Password selected by an administrator for a password reset.</summary>
public sealed record ResetApplicationUserPasswordRequest
{
    [Required, StringLength(128, MinimumLength = 8)]
    public required string NewPassword { get; init; }
}

/// <summary>Summary of an application user for administration screens.</summary>
public sealed record AdminUserResponse(
    string Id,
    string Username,
    string DisplayName,
    bool IsActive,
    IReadOnlyList<string> Roles,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? LastLoginAtUtc);

/// <summary>Component definition and current effective and override levels for one user.</summary>
public sealed record AdminUserPermissionResponse(
    string PermissionId,
    string Description,
    string EffectiveLevel,
    string? UserOverride);

/// <summary>Summary counts and recent activity for the administration dashboard.</summary>
public sealed record AdminDashboardResponse(
    int TotalUsers,
    int ActiveUsers,
    int DisabledUsers,
    IReadOnlyList<LoginHistoryResponse> RecentLogins,
    IReadOnlyList<AuditLogResponse> RecentAuditEvents);

/// <summary>Authentication event shown in the admin login history.</summary>
public sealed record LoginHistoryResponse(
    long Id,
    string Username,
    bool Succeeded,
    DateTimeOffset OccurredAtUtc,
    string? RemoteAddress);

/// <summary>Administrative event shown in the read-only audit log.</summary>
public sealed record AuditLogResponse(
    long Id,
    string? ActorUserId,
    string? TargetUserId,
    string Action,
    DateTimeOffset OccurredAtUtc,
    string? Details);

/// <summary>Role definition shown in role management.</summary>
public sealed record AdminRoleResponse(string Name, string Description);
