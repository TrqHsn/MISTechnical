using ADApi.Services.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ADApi.Models.Security;

public sealed class AuthDbContextFactory : IDesignTimeDbContextFactory<AuthDbContext>
{
    public AuthDbContext CreateDbContext(string[] args)
    {
        var options = new AuthOptions();
        var configuration = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: true)
            .AddEnvironmentVariables()
            .Build();
        configuration.GetSection(AuthOptions.SectionName).Bind(options);

        var databasePath = options.ResolveDatabasePath();
        Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
        var builder = new DbContextOptionsBuilder<AuthDbContext>();
        builder.UseSqlite($"Data Source={databasePath}");
        return new AuthDbContext(builder.Options);
    }
}
