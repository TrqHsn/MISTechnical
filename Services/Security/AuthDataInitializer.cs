using ADApi.Models.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ADApi.Services.Security;

public static class AuthDataInitializer
{
    public static readonly string[] ComponentIds =
    [
        "ADTools",
        "DeviceManagement",
        "NetworkDashboard",
        "Inventory",
        "Kiosk",
        "Printer",
        "Forms",
        "MailboxQuota",
        "WeekPlanner",
        "Files",
        "Alerts",
        "ImportantLinks",
        "OtherTools",
        "CamMicSpeaker",
        "DisplayTest"
    ];

    private static readonly IReadOnlyDictionary<string, string> Descriptions =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["ADTools"] = "Active Directory tools",
            ["DeviceManagement"] = "Device and computer management",
            ["NetworkDashboard"] = "Network monitoring and tools",
            ["Inventory"] = "Hardware inventory",
            ["Kiosk"] = "Digital signage management",
            ["Printer"] = "Printing and label tools",
            ["Forms"] = "Forms and document generation",
            ["MailboxQuota"] = "Mailbox storage notifications",
            ["WeekPlanner"] = "Weekly planner",
            ["Files"] = "SMB file browser",
            ["Alerts"] = "Alert messaging",
            ["ImportantLinks"] = "Important links",
            ["OtherTools"] = "Additional utility tools",
            ["CamMicSpeaker"] = "Camera, microphone, and speaker tests",
            ["DisplayTest"] = "Display tests"
        };

    public static async Task InitializeAsync(
        AuthDbContext db,
        RoleManager<ApplicationRole> roles,
        CancellationToken cancellationToken = default)
    {
        foreach (var roleName in new[] { "Admin", "Manager", "FullAccess", "RestrictedUser" })
        {
            if (!await roles.RoleExistsAsync(roleName))
            {
                var result = await roles.CreateAsync(new ApplicationRole
                {
                    Name = roleName,
                    Description = roleName switch
                    {
                        "Admin" => "Administration access",
                        "Manager" => "Normal application access",
                        "FullAccess" => "Full normal application access",
                        _ => "Explicitly assigned component access"
                    }
                });
                EnsureSucceeded(result, $"Could not create the {roleName} role.");
            }
        }

        foreach (var componentId in ComponentIds)
        {
            if (!await db.ComponentPermissions.AnyAsync(p => p.Id == componentId, cancellationToken))
            {
                db.ComponentPermissions.Add(new ComponentPermission
                {
                    Id = componentId,
                    Description = Descriptions[componentId]
                });
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        var broadAccessRoles = await roles.Roles
            .Where(role => role.Name == "Manager" || role.Name == "FullAccess")
            .ToListAsync(cancellationToken);
        foreach (var role in broadAccessRoles)
        {
            foreach (var componentId in ComponentIds)
            {
                var exists = await db.RoleComponentPermissions.AnyAsync(
                    item => item.RoleId == role.Id && item.PermissionId == componentId,
                    cancellationToken);
                if (!exists)
                {
                    db.RoleComponentPermissions.Add(new RoleComponentPermission
                    {
                        RoleId = role.Id,
                        PermissionId = componentId,
                        Level = "Full"
                    });
                }
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static void EnsureSucceeded(IdentityResult result, string message)
    {
        if (!result.Succeeded)
            throw new InvalidOperationException($"{message} {string.Join("; ", result.Errors.Select(e => e.Code))}");
    }
}
