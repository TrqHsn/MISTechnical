using ADApi.Models.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ADApi.Services.Security;

public static class AuthBootstrapper
{
    public static async Task InitializeDatabaseAsync(IServiceProvider services)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AuthDbContext>();
        await db.Database.MigrateAsync();
        await AuthDataInitializer.InitializeAsync(
            db,
            scope.ServiceProvider.GetRequiredService<RoleManager<ApplicationRole>>());
    }

    public static async Task CreateInitialAdminAsync(IServiceProvider services, string username)
    {
        await InitializeDatabaseAsync(services);
        await using var scope = services.CreateAsyncScope();
        var serviceProvider = scope.ServiceProvider;
        var users = serviceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        if (await users.Users.AnyAsync(user => user.UserName == username))
            throw new InvalidOperationException($"The account '{username}' already exists.");
        var activeAdmins = await users.GetUsersInRoleAsync("Admin");
        if (activeAdmins.Count > 0)
            throw new InvalidOperationException("An administrator already exists; bootstrap is disabled.");

        Console.Write($"Password for initial administrator '{username}': ");
        var password = ReadPassword();
        Console.WriteLine();
        Console.Write("Confirm password: ");
        var confirmation = ReadPassword();
        Console.WriteLine();

        if (!string.Equals(password, confirmation, StringComparison.Ordinal))
            throw new InvalidOperationException("The passwords did not match.");

        var user = new ApplicationUser
        {
            UserName = username,
            DisplayName = "Administrator",
            IsActive = true,
            LockoutEnabled = true
        };
        var createResult = await users.CreateAsync(user, password);
        if (!createResult.Succeeded)
        {
            var codes = string.Join(", ", createResult.Errors.Select(error => error.Code));
            throw new InvalidOperationException($"Initial administrator creation failed: {codes}");
        }

        var roleResult = await users.AddToRoleAsync(user, "Admin");
        if (!roleResult.Succeeded)
        {
            await users.DeleteAsync(user);
            throw new InvalidOperationException(
                $"Could not assign the Admin role: {string.Join(", ", roleResult.Errors.Select(error => error.Code))}");
        }

        await WriteBootstrapAuditAsync(serviceProvider, user.Id);
        Console.WriteLine("Initial administrator created. Remove the bootstrap command from your deployment procedure.");
    }

    private static async Task WriteBootstrapAuditAsync(IServiceProvider services, string userId)
    {
        var db = services.GetRequiredService<AuthDbContext>();
        db.AuditLogs.Add(new AuditLogEntry
        {
            TargetUserId = userId,
            Action = "InitialAdminCreated",
            Details = "Initial administrator created through the interactive bootstrap."
        });
        await db.SaveChangesAsync();
    }

    private static string ReadPassword()
    {
        var value = new System.Text.StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter)
                return value.ToString();
            if (key.Key == ConsoleKey.Backspace)
            {
                if (value.Length > 0)
                    value.Length--;
                continue;
            }
            if (!char.IsControl(key.KeyChar))
                value.Append(key.KeyChar);
        }
    }
}
