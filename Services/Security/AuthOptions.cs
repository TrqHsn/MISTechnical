namespace ADApi.Services.Security;

public sealed class AuthOptions
{
    public const string SectionName = "Authentication";

    public string? SigningKey { get; set; }
    public string Issuer { get; set; } = "ADApi";
    public string Audience { get; set; } = "MIS";
    public int AccessTokenMinutes { get; set; } = 20;
    public string? DatabasePath { get; set; }

    public string ResolveDatabasePath(string? contentRootPath = null)
    {
        if (!string.IsNullOrWhiteSpace(DatabasePath))
            return Path.GetFullPath(DatabasePath);

        return Path.Combine(contentRootPath ?? Directory.GetCurrentDirectory(), "App_Data", "auth.db");
    }

    public string ResolveSigningKey(string contentRootPath)
    {
        var keyPath = Path.Combine(contentRootPath, "App_Data", "auth-signing-key");
        Directory.CreateDirectory(Path.GetDirectoryName(keyPath)!);

        if (string.IsNullOrWhiteSpace(SigningKey))
        {
            if (File.Exists(keyPath))
            {
                SigningKey = File.ReadAllText(keyPath).Trim();
            }
            else
            {
                SigningKey = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
                try
                {
                    using var stream = new FileStream(keyPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                    var keyBytes = System.Text.Encoding.UTF8.GetBytes(SigningKey);
                    stream.Write(keyBytes);
                    stream.Flush(flushToDisk: true);
                }
                catch (IOException) when (File.Exists(keyPath))
                {
                    SigningKey = File.ReadAllText(keyPath).Trim();
                }
            }
        }
        else if (!File.Exists(keyPath))
        {
            using var stream = new FileStream(keyPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            var keyBytes = System.Text.Encoding.UTF8.GetBytes(SigningKey);
            stream.Write(keyBytes);
            stream.Flush(flushToDisk: true);
        }

        GetSigningKey();
        return SigningKey;
    }

    public byte[] GetSigningKey()
    {
        if (string.IsNullOrWhiteSpace(SigningKey) || System.Text.Encoding.UTF8.GetByteCount(SigningKey) < 32)
            throw new InvalidOperationException(
                "Authentication:SigningKey must be configured as a random secret of at least 32 bytes.");

        return System.Text.Encoding.UTF8.GetBytes(SigningKey);
    }
}
