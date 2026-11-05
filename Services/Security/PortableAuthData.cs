using Microsoft.Data.Sqlite;

namespace ADApi.Services.Security;

public static class PortableAuthData
{
    public static async Task<string> InitializeAsync(AuthOptions options, string contentRootPath)
    {
        options.ResolveSigningKey(contentRootPath);

        var databasePath = options.ResolveDatabasePath(contentRootPath);
        Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);

        if (string.IsNullOrWhiteSpace(options.DatabasePath) && !File.Exists(databasePath))
        {
            var applicationData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var legacyDatabasePath = Path.Combine(applicationData, "ADApi", "auth.db");
            if (File.Exists(legacyDatabasePath)
                && !string.Equals(
                    Path.GetFullPath(legacyDatabasePath),
                    Path.GetFullPath(databasePath),
                    StringComparison.OrdinalIgnoreCase))
            {
                await using var source = new SqliteConnection(
                    new SqliteConnectionStringBuilder { DataSource = legacyDatabasePath, Mode = SqliteOpenMode.ReadWrite }.ToString());
                await using var destination = new SqliteConnection(
                    new SqliteConnectionStringBuilder { DataSource = databasePath, Mode = SqliteOpenMode.ReadWriteCreate }.ToString());
                await source.OpenAsync();
                await destination.OpenAsync();
                source.BackupDatabase(destination);
                Console.WriteLine($"Existing authentication database copied to {databasePath}.");
            }
        }

        return databasePath;
    }
}
