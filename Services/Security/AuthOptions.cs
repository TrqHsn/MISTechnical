namespace ADApi.Services.Security;

public sealed class AuthOptions
{
    public const string SectionName = "Authentication";

    public string? SigningKey { get; set; }
    public string Issuer { get; set; } = "ADApi";
    public string Audience { get; set; } = "MIS";
    public int AccessTokenMinutes { get; set; } = 20;
    public string? DatabasePath { get; set; }

    public string ResolveDatabasePath()
    {
        if (!string.IsNullOrWhiteSpace(DatabasePath))
            return Path.GetFullPath(DatabasePath);

        var applicationData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(applicationData, "ADApi", "auth.db");
    }

    public byte[] GetSigningKey()
    {
        if (string.IsNullOrWhiteSpace(SigningKey) || System.Text.Encoding.UTF8.GetByteCount(SigningKey) < 32)
            throw new InvalidOperationException(
                "Authentication:SigningKey must be configured as a random secret of at least 32 bytes.");

        return System.Text.Encoding.UTF8.GetBytes(SigningKey);
    }
}
