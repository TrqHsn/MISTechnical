using System.Security.Claims;
using ADApi.Models.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ADApi.Services.Security;

public sealed class ComponentPermissionRequirement(IReadOnlyCollection<string> permissionIds)
    : IAuthorizationRequirement
{
    public IReadOnlyCollection<string> PermissionIds { get; } = permissionIds;
}

public sealed class ComponentPermissionHandler(
    AuthDbContext db,
    UserManager<ApplicationUser> users)
    : AuthorizationHandler<ComponentPermissionRequirement, HttpContext>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        ComponentPermissionRequirement requirement,
        HttpContext httpContext)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.User.FindFirstValue("sub");
        if (userId is null)
            return;

        var user = await users.FindByIdAsync(userId);
        if (user is null || !user.IsActive)
            return;

        var roles = await users.GetRolesAsync(user);
        if (roles.Contains("Admin", StringComparer.OrdinalIgnoreCase))
        {
            context.Succeed(requirement);
            return;
        }

        var requiredLevel = HttpMethods.IsGet(httpContext.Request.Method)
            || HttpMethods.IsHead(httpContext.Request.Method)
            || HttpMethods.IsOptions(httpContext.Request.Method)
            ? "View"
            : "Full";

        var userOverrides = await db.UserComponentPermissions
            .AsNoTracking()
            .Where(item => item.UserId == userId && requirement.PermissionIds.Contains(item.PermissionId))
            .ToDictionaryAsync(item => item.PermissionId, item => item.Level, httpContext.RequestAborted);

        var roleIds = await db.UserRoles
            .Where(item => item.UserId == userId)
            .Select(item => item.RoleId)
            .ToListAsync(httpContext.RequestAborted);

        var overriddenPermissions = userOverrides.Keys.ToHashSet(StringComparer.Ordinal);
        foreach (var permissionId in requirement.PermissionIds)
        {
            if (userOverrides.TryGetValue(permissionId, out var level) && Grants(level, requiredLevel))
            {
                context.Succeed(requirement);
                return;
            }
        }

        var remainingPermissionIds = requirement.PermissionIds
            .Where(permissionId => !overriddenPermissions.Contains(permissionId))
            .ToArray();
        if (remainingPermissionIds.Length == 0)
            return;

        var rolePermissions = await db.RoleComponentPermissions
            .AsNoTracking()
            .Where(item => roleIds.Contains(item.RoleId)
                && remainingPermissionIds.Contains(item.PermissionId))
            .Select(item => item.Level)
            .ToListAsync(httpContext.RequestAborted);

        if (rolePermissions.Any(level => Grants(level, requiredLevel)))
            context.Succeed(requirement);
    }

    private static bool Grants(string actual, string required) =>
        string.Equals(actual, "Full", StringComparison.OrdinalIgnoreCase)
        || (string.Equals(actual, "View", StringComparison.OrdinalIgnoreCase)
            && string.Equals(required, "View", StringComparison.OrdinalIgnoreCase));
}

public sealed class ComponentPermissionPolicyProvider(
    IOptions<AuthorizationOptions> options)
    : DefaultAuthorizationPolicyProvider(options)
{
    private const string PolicyPrefix = "Component:";

    public override Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (!policyName.StartsWith(PolicyPrefix, StringComparison.Ordinal))
            return base.GetPolicyAsync(policyName);

        var permissionIds = policyName[PolicyPrefix.Length..]
            .Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var policy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .AddRequirements(new ComponentPermissionRequirement(permissionIds))
            .Build();
        return Task.FromResult<AuthorizationPolicy?>(policy);
    }
}
