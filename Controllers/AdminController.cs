using System.Security.Claims;
using ADApi.Models.Security;
using ADApi.Models.Security.Contracts;
using ADApi.Services.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ADApi.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin")]
public sealed class AdminController(
    AuthDbContext db,
    UserManager<ApplicationUser> users,
    RoleManager<ApplicationRole> roles,
    IAuthSessionService sessions) : ControllerBase
{
    [HttpGet("dashboard")]
    [ProducesResponseType<AdminDashboardResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminDashboardResponse>> GetDashboard(CancellationToken cancellationToken)
    {
        // SQLite cannot translate ORDER BY on DateTimeOffset; these values are stored in UTC text form.
        var recentLogins = await db.LoginHistory
            .FromSqlRaw("""SELECT * FROM "LoginHistory" ORDER BY "OccurredAtUtc" DESC LIMIT 10""")
            .AsNoTracking()
            .Select(item => new LoginHistoryResponse(
                item.Id, item.Username, item.Succeeded, item.OccurredAtUtc, item.RemoteAddress))
            .ToListAsync(cancellationToken);
        var recentAudit = await db.AuditLogs
            .FromSqlRaw("""SELECT * FROM "AuditLogs" ORDER BY "OccurredAtUtc" DESC LIMIT 10""")
            .AsNoTracking()
            .Select(item => new AuditLogResponse(
                item.Id, item.ActorUserId, item.TargetUserId, item.Action, item.OccurredAtUtc, item.Details))
            .ToListAsync(cancellationToken);

        return Ok(new AdminDashboardResponse(
            await users.Users.CountAsync(cancellationToken),
            await users.Users.CountAsync(item => item.IsActive, cancellationToken),
            await users.Users.CountAsync(item => !item.IsActive, cancellationToken),
            recentLogins,
            recentAudit));
    }

    [HttpGet("users")]
    [ProducesResponseType<IReadOnlyList<AdminUserResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminUserResponse>>> GetUsers(
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var query = users.Users.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var value = search.Trim();
            query = query.Where(user => user.UserName!.Contains(value)
                || user.DisplayName.Contains(value));
        }

        var userList = await query.OrderBy(user => user.UserName)
            .Take(250)
            .ToListAsync(cancellationToken);
        var response = new List<AdminUserResponse>(userList.Count);
        foreach (var user in userList)
            response.Add(await ToAdminUserResponseAsync(user));

        return Ok(response);
    }

    [HttpGet("users/{id}")]
    [ProducesResponseType<AdminUserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AdminUserResponse>> GetUser(string id)
    {
        var user = await users.FindByIdAsync(id);
        return user is null ? NotFound() : Ok(await ToAdminUserResponseAsync(user));
    }

    [HttpPost("users")]
    [ProducesResponseType<AdminUserResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AdminUserResponse>> CreateUser(
        [FromBody] CreateApplicationUserRequest request,
        CancellationToken cancellationToken)
    {
        if (!await roles.RoleExistsAsync(request.Role))
            return BadRequest(new ProblemDetails { Title = "Unknown role." });
        if (await users.FindByNameAsync(request.Username.Trim()) is not null)
            return Conflict(new ProblemDetails { Title = "Username is already in use." });

        var user = new ApplicationUser
        {
            UserName = request.Username.Trim(),
            DisplayName = request.DisplayName.Trim(),
            IsActive = true,
            LockoutEnabled = true
        };
        var createResult = await users.CreateAsync(user, request.InitialPassword);
        if (!createResult.Succeeded)
            return BadRequest(new ProblemDetails
            {
                Title = "User creation was rejected.",
                Detail = string.Join(", ", createResult.Errors.Select(error => error.Code))
            });

        var roleResult = await users.AddToRoleAsync(user, request.Role);
        if (!roleResult.Succeeded)
        {
            await users.DeleteAsync(user);
            return BadRequest(new ProblemDetails
            {
                Title = "Role assignment failed.",
                Detail = string.Join(", ", roleResult.Errors.Select(error => error.Code))
            });
        }

        await WriteAuditAsync("UserCreated", user.Id, $"Created account with role {request.Role}.", cancellationToken);
        var response = await ToAdminUserResponseAsync(user);
        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, response);
    }

    [HttpPut("users/{id}")]
    [ProducesResponseType<AdminUserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AdminUserResponse>> UpdateUser(
        string id,
        [FromBody] UpdateApplicationUserRequest request,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(id);
        if (user is null)
            return NotFound();

        var wasActive = user.IsActive;
        if (wasActive && !request.IsActive && await users.IsInRoleAsync(user, "Admin"))
        {
            var otherActiveAdmins = await users.GetUsersInRoleAsync("Admin");
            if (!otherActiveAdmins.Any(admin => admin.Id != user.Id && admin.IsActive))
                return Conflict(new ProblemDetails { Title = "The last active administrator cannot be deactivated." });
        }

        user.DisplayName = request.DisplayName.Trim();
        user.IsActive = request.IsActive;
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
            return IdentityFailure(result);

        if (wasActive && !user.IsActive)
            await sessions.RevokeAllSessionsAsync(user.Id, cancellationToken);

        await WriteAuditAsync(
            user.IsActive ? "UserUpdated" : "UserDeactivated",
            user.Id,
            "Updated account profile or activation state.",
            cancellationToken);
        return Ok(await ToAdminUserResponseAsync(user));
    }

    [HttpDelete("users/{id}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> DeleteUser(string id, CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(id);
        if (user is null)
            return NotFound();

        var actorId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (string.Equals(actorId, user.Id, StringComparison.Ordinal))
        {
            return Conflict(new ProblemDetails
            {
                Title = "You cannot delete the account you are currently using."
            });
        }

        if (user.IsActive && await users.IsInRoleAsync(user, "Admin"))
        {
            var admins = await users.GetUsersInRoleAsync("Admin");
            if (!admins.Any(admin => admin.Id != user.Id && admin.IsActive))
            {
                return Conflict(new ProblemDetails
                {
                    Title = "The last active administrator cannot be deleted."
                });
            }
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await WriteAuditAsync("UserDeleted", user.Id, "Administrator deleted the application account.", cancellationToken);

        var result = await users.DeleteAsync(user);
        if (!result.Succeeded)
        {
            await transaction.RollbackAsync(cancellationToken);
            return IdentityFailure(result);
        }

        await transaction.CommitAsync(cancellationToken);
        return NoContent();
    }

    [HttpPut("users/{id}/role")]
    [ProducesResponseType<AdminUserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AdminUserResponse>> AssignRole(
        string id,
        [FromBody] AssignApplicationRoleRequest request,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(id);
        if (user is null)
            return NotFound();
        if (!await roles.RoleExistsAsync(request.Role))
            return BadRequest(new ProblemDetails { Title = "Unknown role." });

        var existingRoles = await users.GetRolesAsync(user);
        if (existingRoles.Contains("Admin", StringComparer.OrdinalIgnoreCase)
            && !request.Role.Equals("Admin", StringComparison.OrdinalIgnoreCase))
        {
            var otherActiveAdmins = await users.GetUsersInRoleAsync("Admin");
            if (!otherActiveAdmins.Any(admin => admin.Id != user.Id && admin.IsActive))
                return Conflict(new ProblemDetails { Title = "The last active administrator cannot be demoted." });
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var removeResult = await users.RemoveFromRolesAsync(user, existingRoles);
        if (!removeResult.Succeeded)
            return IdentityFailure(removeResult);

        var addResult = await users.AddToRoleAsync(user, request.Role);
        if (!addResult.Succeeded)
            return IdentityFailure(addResult);

        await sessions.RevokeAllSessionsAsync(user.Id, cancellationToken);
        await WriteAuditAsync("RoleChanged", user.Id, $"Assigned role {request.Role}.", cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(await ToAdminUserResponseAsync(user));
    }

    [HttpGet("users/{id}/permissions")]
    [ProducesResponseType<IReadOnlyList<AdminUserPermissionResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<AdminUserPermissionResponse>>> GetUserPermissions(
        string id,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(id);
        if (user is null)
            return NotFound();

        var response = await CurrentPermissionsForAsync(user, cancellationToken);
        return Ok(response);
    }

    [HttpPut("users/{id}/permissions/{permissionId}")]
    [ProducesResponseType<AdminUserPermissionResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AdminUserPermissionResponse>> SetUserPermission(
        string id,
        string permissionId,
        [FromBody] SetUserComponentPermissionRequest request,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(id);
        var component = await db.ComponentPermissions.FindAsync([permissionId], cancellationToken);
        if (user is null || component is null)
            return NotFound();

        var permission = await db.UserComponentPermissions.FindAsync([id, permissionId], cancellationToken);
        if (permission is null)
        {
            permission = new UserComponentPermission
            {
                UserId = id,
                PermissionId = permissionId,
                Level = request.Level
            };
            db.UserComponentPermissions.Add(permission);
        }
        else
        {
            permission.Level = request.Level;
        }

        await db.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "UserPermissionChanged",
            id,
            $"Set {permissionId} permission to {request.Level}.",
            cancellationToken);
        var current = await CurrentPermissionsForAsync(user, cancellationToken);
        return Ok(current.Single(item => item.PermissionId == permissionId));
    }

    [HttpDelete("users/{id}/permissions/{permissionId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RemoveUserPermissionOverride(
        string id,
        string permissionId,
        CancellationToken cancellationToken)
    {
        var permission = await db.UserComponentPermissions.FindAsync([id, permissionId], cancellationToken);
        if (permission is null)
            return NoContent();

        db.UserComponentPermissions.Remove(permission);
        await db.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "UserPermissionOverrideRemoved",
            id,
            $"Removed the {permissionId} user permission override.",
            cancellationToken);
        return NoContent();
    }

    [HttpGet("roles")]
    [ProducesResponseType<IReadOnlyList<AdminRoleResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminRoleResponse>>> GetRoles(CancellationToken cancellationToken)
    {
        var response = await roles.Roles.AsNoTracking()
            .OrderBy(role => role.Name)
            .Select(role => new AdminRoleResponse(role.Name!, role.Description))
            .ToListAsync(cancellationToken);
        return Ok(response);
    }

    [HttpGet("roles/{roleName}/permissions")]
    [ProducesResponseType<IReadOnlyList<AdminUserPermissionResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<IReadOnlyList<AdminUserPermissionResponse>>> GetRolePermissions(
        string roleName,
        CancellationToken cancellationToken)
    {
        var role = await roles.FindByNameAsync(roleName);
        if (role is null)
            return NotFound();

        var assigned = await db.RoleComponentPermissions.AsNoTracking()
            .Where(item => item.RoleId == role.Id)
            .ToDictionaryAsync(item => item.PermissionId, item => item.Level, cancellationToken);
        var definitions = await db.ComponentPermissions.AsNoTracking()
            .OrderBy(item => item.Id)
            .ToListAsync(cancellationToken);
        return Ok(definitions.Select(item => new AdminUserPermissionResponse(
            item.Id,
            item.Description,
            assigned.GetValueOrDefault(item.Id, "None"),
            assigned.GetValueOrDefault(item.Id))).ToArray());
    }

    [HttpPut("roles/{roleName}/permissions/{permissionId}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetRolePermission(
        string roleName,
        string permissionId,
        [FromBody] SetRoleComponentPermissionRequest request,
        CancellationToken cancellationToken)
    {
        if (roleName.Equals("Admin", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new ProblemDetails { Title = "Admin permissions are managed by the Admin role." });

        var role = await roles.FindByNameAsync(roleName);
        var component = await db.ComponentPermissions.FindAsync([permissionId], cancellationToken);
        if (role is null || component is null)
            return NotFound();

        var permission = await db.RoleComponentPermissions.FindAsync([role.Id, permissionId], cancellationToken);
        if (permission is null)
        {
            db.RoleComponentPermissions.Add(new RoleComponentPermission
            {
                RoleId = role.Id,
                PermissionId = permissionId,
                Level = request.Level
            });
        }
        else
        {
            permission.Level = request.Level;
        }

        await db.SaveChangesAsync(cancellationToken);
        await WriteAuditAsync(
            "RolePermissionChanged",
            null,
            $"Set {roleName}/{permissionId} permission to {request.Level}.",
            cancellationToken);
        return NoContent();
    }

    [HttpPost("users/{id}/reset-password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ResetPassword(
        string id,
        [FromBody] ResetApplicationUserPasswordRequest request,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByIdAsync(id);
        if (user is null)
            return NotFound();

        var token = await users.GeneratePasswordResetTokenAsync(user);
        var result = await users.ResetPasswordAsync(user, token, request.NewPassword);
        if (!result.Succeeded)
            return IdentityFailure(result);

        await sessions.RevokeAllSessionsAsync(user.Id, cancellationToken);
        await WriteAuditAsync("PasswordReset", user.Id, "Administrator reset the account password.", cancellationToken);
        return NoContent();
    }

    [HttpDelete("users/{id}/sessions")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> RevokeSessions(string id, CancellationToken cancellationToken)
    {
        if (await users.FindByIdAsync(id) is null)
            return NotFound();

        await sessions.RevokeAllSessionsAsync(id, cancellationToken);
        await WriteAuditAsync("SessionsRevoked", id, "Administrator revoked active sessions.", cancellationToken);
        return NoContent();
    }

    [HttpGet("login-history")]
    [ProducesResponseType<IReadOnlyList<LoginHistoryResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<LoginHistoryResponse>>> GetLoginHistory(
        CancellationToken cancellationToken)
    {
        var response = await db.LoginHistory
            .FromSqlRaw("""SELECT * FROM "LoginHistory" ORDER BY "OccurredAtUtc" DESC LIMIT 200""")
            .AsNoTracking()
            .Select(item => new LoginHistoryResponse(
                item.Id, item.Username, item.Succeeded, item.OccurredAtUtc, item.RemoteAddress))
            .ToListAsync(cancellationToken);
        return Ok(response);
    }

    [HttpGet("audit-logs")]
    [ProducesResponseType<IReadOnlyList<AuditLogResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AuditLogResponse>>> GetAuditLogs(
        CancellationToken cancellationToken)
    {
        var response = await db.AuditLogs
            .FromSqlRaw("""SELECT * FROM "AuditLogs" ORDER BY "OccurredAtUtc" DESC LIMIT 200""")
            .AsNoTracking()
            .Select(item => new AuditLogResponse(
                item.Id, item.ActorUserId, item.TargetUserId, item.Action, item.OccurredAtUtc, item.Details))
            .ToListAsync(cancellationToken);
        return Ok(response);
    }

    private async Task<AdminUserResponse> ToAdminUserResponseAsync(ApplicationUser user)
    {
        var userRoles = await users.GetRolesAsync(user);
        return new AdminUserResponse(
            user.Id,
            user.UserName ?? string.Empty,
            user.DisplayName,
            user.IsActive,
            userRoles.ToArray(),
            user.CreatedAtUtc,
            user.LastLoginAtUtc);
    }

    private async Task<IReadOnlyList<AdminUserPermissionResponse>> CurrentPermissionsForAsync(
        ApplicationUser user,
        CancellationToken cancellationToken)
    {
        var authUser = await sessions.GetUserResponseAsync(user, cancellationToken);
        var overrides = await db.UserComponentPermissions.AsNoTracking()
            .Where(item => item.UserId == user.Id)
            .ToDictionaryAsync(item => item.PermissionId, item => item.Level, cancellationToken);
        var definitions = await db.ComponentPermissions.AsNoTracking()
            .OrderBy(item => item.Id)
            .ToListAsync(cancellationToken);
        return definitions.Select(item => new AdminUserPermissionResponse(
            item.Id,
            item.Description,
            authUser.Permissions.GetValueOrDefault(item.Id, "None"),
            overrides.GetValueOrDefault(item.Id))).ToArray();
    }

    private async Task WriteAuditAsync(
        string action,
        string? targetUserId,
        string details,
        CancellationToken cancellationToken)
    {
        db.AuditLogs.Add(new AuditLogEntry
        {
            ActorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub"),
            TargetUserId = targetUserId,
            Action = action,
            Details = details
        });
        await db.SaveChangesAsync(cancellationToken);
    }

    private BadRequestObjectResult IdentityFailure(IdentityResult result) =>
        BadRequest(new ProblemDetails
        {
            Title = "The requested account operation was rejected.",
            Detail = string.Join(", ", result.Errors.Select(error => error.Code))
        });
}
