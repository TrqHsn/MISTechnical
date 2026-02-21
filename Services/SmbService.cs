using System.IO.Compression;
using System.Text.RegularExpressions;
using ADApi.Models;
using Microsoft.AspNetCore.StaticFiles;

namespace ADApi.Services;

public enum SmbErrorCode
{
    InvalidPath,
    NotFound,
    AccessDenied,
    NetworkUnavailable
}

public sealed class SmbServiceException : Exception
{
    public SmbErrorCode Code { get; }

    public SmbServiceException(SmbErrorCode code, string message, Exception? inner = null)
        : base(message, inner)
    {
        Code = code;
    }
}

public class SmbService : ISmbService
{
    private static readonly Regex TraversalRegex = new(@"(^|[\\/])\.\.($|[\\/])", RegexOptions.Compiled);
    private readonly ILogger<SmbService> _logger;
    private readonly FileExtensionContentTypeProvider _contentTypeProvider = new();

    public SmbService(ILogger<SmbService> logger)
    {
        _logger = logger;
    }

    public async Task<SmbBrowseResponseDto> BrowseAsync(string uncPath, CancellationToken cancellationToken = default)
    {
        var normalizedPath = NormalizeAndValidateUncPath(uncPath);

        try
        {
            if (!Directory.Exists(normalizedPath))
            {
                throw new SmbServiceException(SmbErrorCode.NotFound, "Path not found.");
            }

            var options = new EnumerationOptions
            {
                IgnoreInaccessible = true,
                RecurseSubdirectories = false,
                ReturnSpecialDirectories = false,
                AttributesToSkip = 0
            };

            var items = new List<SmbEntryDto>();

            foreach (var directoryPath in Directory.EnumerateDirectories(normalizedPath, "*", options))
            {
                cancellationToken.ThrowIfCancellationRequested();
                try
                {
                    var dirInfo = new DirectoryInfo(directoryPath);
                    items.Add(new SmbEntryDto
                    {
                        Name = dirInfo.Name,
                        FullPath = NormalizeAndValidateUncPath(dirInfo.FullName),
                        IsDirectory = true,
                        Size = null,
                        LastModified = dirInfo.LastWriteTimeUtc,
                        Extension = string.Empty,
                        IsHidden = dirInfo.Attributes.HasFlag(FileAttributes.Hidden),
                        IsSystem = dirInfo.Attributes.HasFlag(FileAttributes.System),
                        Type = "Folder"
                    });
                }
                catch (UnauthorizedAccessException)
                {
                    _logger.LogWarning("Skipping inaccessible directory: {DirectoryPath}", directoryPath);
                }
                catch (IOException ex)
                {
                    _logger.LogWarning(ex, "Skipping directory due to IO error: {DirectoryPath}", directoryPath);
                }
            }

            foreach (var filePath in Directory.EnumerateFiles(normalizedPath, "*", options))
            {
                cancellationToken.ThrowIfCancellationRequested();
                try
                {
                    var fileInfo = new FileInfo(filePath);
                    items.Add(new SmbEntryDto
                    {
                        Name = fileInfo.Name,
                        FullPath = NormalizeAndValidateUncPath(fileInfo.FullName),
                        IsDirectory = false,
                        Size = fileInfo.Length,
                        LastModified = fileInfo.LastWriteTimeUtc,
                        Extension = fileInfo.Extension,
                        IsHidden = fileInfo.Attributes.HasFlag(FileAttributes.Hidden),
                        IsSystem = fileInfo.Attributes.HasFlag(FileAttributes.System),
                        Type = string.IsNullOrWhiteSpace(fileInfo.Extension)
                            ? "File"
                            : $"{fileInfo.Extension.TrimStart('.').ToUpperInvariant()} File"
                    });
                }
                catch (UnauthorizedAccessException)
                {
                    _logger.LogWarning("Skipping inaccessible file: {FilePath}", filePath);
                }
                catch (IOException ex)
                {
                    _logger.LogWarning(ex, "Skipping file due to IO error: {FilePath}", filePath);
                }
            }

            await Task.CompletedTask;

            return new SmbBrowseResponseDto
            {
                Path = normalizedPath,
                Items = items
                    .OrderByDescending(i => i.IsDirectory)
                    .ThenBy(i => i.Name, StringComparer.OrdinalIgnoreCase)
                    .ToList()
            };
        }
        catch (UnauthorizedAccessException ex)
        {
            throw new SmbServiceException(SmbErrorCode.AccessDenied, "Access denied.", ex);
        }
        catch (DirectoryNotFoundException ex)
        {
            throw new SmbServiceException(SmbErrorCode.NotFound, "Path not found.", ex);
        }
        catch (IOException ex)
        {
            throw new SmbServiceException(SmbErrorCode.NetworkUnavailable, "Network path is unavailable.", ex);
        }
    }

    public Task<(Stream Stream, string FileName, long Length, string ContentType)> OpenFileReadStreamAsync(string uncPath, CancellationToken cancellationToken = default)
    {
        var normalizedPath = NormalizeAndValidateUncPath(uncPath);

        try
        {
            if (!File.Exists(normalizedPath))
            {
                throw new SmbServiceException(SmbErrorCode.NotFound, "File not found.");
            }

            var fileInfo = new FileInfo(normalizedPath);
            var stream = new FileStream(
                normalizedPath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.ReadWrite,
                1024 * 128,
                FileOptions.Asynchronous | FileOptions.SequentialScan);

            var fileName = fileInfo.Name;
            var contentType = _contentTypeProvider.TryGetContentType(fileName, out var ct)
                ? ct
                : "application/octet-stream";

            return Task.FromResult((Stream: (Stream)stream, FileName: fileName, Length: fileInfo.Length, ContentType: contentType));
        }
        catch (UnauthorizedAccessException ex)
        {
            throw new SmbServiceException(SmbErrorCode.AccessDenied, "Access denied.", ex);
        }
        catch (DirectoryNotFoundException ex)
        {
            throw new SmbServiceException(SmbErrorCode.NotFound, "Path not found.", ex);
        }
        catch (IOException ex)
        {
            throw new SmbServiceException(SmbErrorCode.NetworkUnavailable, "Network path is unavailable.", ex);
        }
    }

    public Task<string> GetValidatedFolderPathAsync(string uncPath, CancellationToken cancellationToken = default)
    {
        var normalizedPath = NormalizeAndValidateUncPath(uncPath);

        try
        {
            if (!Directory.Exists(normalizedPath))
            {
                throw new SmbServiceException(SmbErrorCode.NotFound, "Folder not found.");
            }

            return Task.FromResult(normalizedPath);
        }
        catch (UnauthorizedAccessException ex)
        {
            throw new SmbServiceException(SmbErrorCode.AccessDenied, "Access denied.", ex);
        }
        catch (DirectoryNotFoundException ex)
        {
            throw new SmbServiceException(SmbErrorCode.NotFound, "Folder not found.", ex);
        }
        catch (IOException ex)
        {
            throw new SmbServiceException(SmbErrorCode.NetworkUnavailable, "Network path is unavailable.", ex);
        }
    }

    public async Task StreamFolderAsZipAsync(string folderPath, Stream output, CancellationToken cancellationToken = default)
    {
        var normalizedRoot = NormalizeAndValidateUncPath(folderPath);

        if (!Directory.Exists(normalizedRoot))
        {
            throw new SmbServiceException(SmbErrorCode.NotFound, "Folder not found.");
        }

        try
        {
            var options = new EnumerationOptions
            {
                IgnoreInaccessible = true,
                RecurseSubdirectories = false,
                ReturnSpecialDirectories = false,
                AttributesToSkip = 0
            };

            // Use a MemoryStream buffer to avoid Kestrel's synchronous I/O restriction
            // For large archives, this will be written in chunks
            using var bufferStream = new MemoryStream();
            using (var archive = new ZipArchive(bufferStream, ZipArchiveMode.Create, leaveOpen: true))
            {
                var directoriesToProcess = new Stack<string>();
                directoriesToProcess.Push(normalizedRoot);

                while (directoriesToProcess.Count > 0)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var currentDir = directoriesToProcess.Pop();

                    foreach (var childDir in Directory.EnumerateDirectories(currentDir, "*", options))
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        try
                        {
                            directoriesToProcess.Push(childDir);
                        }
                        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
                        {
                            _logger.LogWarning(ex, "Skipping directory while zipping: {Directory}", childDir);
                        }
                    }

                    foreach (var filePath in Directory.EnumerateFiles(currentDir, "*", options))
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        try
                        {
                            var relativePath = Path.GetRelativePath(normalizedRoot, filePath).Replace('\\', '/');
                            var entry = archive.CreateEntry(relativePath, CompressionLevel.Fastest);

                            await using var sourceStream = new FileStream(
                                filePath,
                                FileMode.Open,
                                FileAccess.Read,
                                FileShare.ReadWrite,
                                1024 * 128,
                                FileOptions.Asynchronous | FileOptions.SequentialScan);
                            await using var entryStream = entry.Open();
                            await sourceStream.CopyToAsync(entryStream, 1024 * 128, cancellationToken);
                        }
                        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
                        {
                            _logger.LogWarning(ex, "Skipping file while zipping: {FilePath}", filePath);
                        }
                    }
                }
            }

            // Now copy the completed ZIP to output stream asynchronously
            bufferStream.Position = 0;
            await bufferStream.CopyToAsync(output, 81920, cancellationToken);
            await output.FlushAsync(cancellationToken);
        }
        catch (UnauthorizedAccessException ex)
        {
            throw new SmbServiceException(SmbErrorCode.AccessDenied, "Access denied.", ex);
        }
        catch (DirectoryNotFoundException ex)
        {
            throw new SmbServiceException(SmbErrorCode.NotFound, "Folder not found.", ex);
        }
        catch (IOException ex)
        {
            throw new SmbServiceException(SmbErrorCode.NetworkUnavailable, "Network path is unavailable.", ex);
        }
    }

    public async Task<string> ResolveDefaultShareAsync(string serverPath, CancellationToken cancellationToken = default)
    {
        var trimmed = serverPath?.Trim() ?? string.Empty;
        
        // Check if this is a server-only path (e.g., \\server)
        if (!trimmed.StartsWith("\\\\", StringComparison.Ordinal))
        {
            throw new SmbServiceException(SmbErrorCode.InvalidPath, "Only UNC paths are allowed.");
        }

        var parts = trimmed.TrimStart('\\').Split('\\', StringSplitOptions.RemoveEmptyEntries);
        
        // If it already has a share, just normalize and return
        if (parts.Length > 1)
        {
            return NormalizeAndValidateUncPath(serverPath);
        }

        // Try to enumerate available shares using WMI
        var serverName = parts[0];
        try
        {
            var shares = await Task.Run(() => EnumerateSharesViaWmi(serverName), cancellationToken);
            if (shares.Count > 0)
            {
                var firstShare = shares[0];
                var resolvedPath = $@"\\{serverName}\{firstShare}";
                _logger.LogInformation("Auto-resolved {ServerPath} to {ResolvedPath}", serverPath, resolvedPath);
                return NormalizeAndValidateUncPath(resolvedPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to enumerate shares via WMI for {ServerName}, trying default names", serverName);
        }

        // Fallback: Try common default share names in order
        string[] defaultShares = { 
            "shared", "Shared", "SHARED",
            "share", "Share", "SHARE",
            "Users", "users", "USERS",
            "Public", "public", "PUBLIC",
            "Files", "files", "FILES",
            "Data", "data", "DATA"
        };

        foreach (var shareName in defaultShares)
        {
            var testPath = $@"\\{serverName}\{shareName}";
            try
            {
                if (Directory.Exists(testPath))
                {
                    _logger.LogInformation("Resolved {ServerPath} to default share {TestPath}", serverPath, testPath);
                    return NormalizeAndValidateUncPath(testPath);
                }
            }
            catch
            {
                // Continue trying other shares
            }
        }

        throw new SmbServiceException(
            SmbErrorCode.NotFound,
            $"No accessible share found for {serverPath}. Please specify a share name like \\\\{serverName}\\sharename");
    }

    private List<string> EnumerateSharesViaWmi(string serverName)
    {
        var shares = new List<string>();
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(
                $"\\\\{serverName}\\root\\cimv2",
                "SELECT Name, Type FROM Win32_Share WHERE Type = 0");

            foreach (System.Management.ManagementObject share in searcher.Get())
            {
                var name = share["Name"]?.ToString();
                if (!string.IsNullOrWhiteSpace(name) && 
                    !name.EndsWith("$", StringComparison.Ordinal)) // Skip admin shares
                {
                    shares.Add(name);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "WMI enumeration failed for {ServerName}", serverName);
        }

        return shares;
    }

    private static string NormalizeAndValidateUncPath(string rawPath)
    {
        if (string.IsNullOrWhiteSpace(rawPath))
        {
            throw new SmbServiceException(SmbErrorCode.InvalidPath, "Path is required.");
        }

        var candidate = rawPath.Trim().Replace('/', '\\');

        if (!candidate.StartsWith("\\\\", StringComparison.Ordinal))
        {
            throw new SmbServiceException(SmbErrorCode.InvalidPath, "Only UNC paths are allowed.");
        }

        if (TraversalRegex.IsMatch(candidate))
        {
            throw new SmbServiceException(SmbErrorCode.InvalidPath, "Relative traversal is not allowed.");
        }

        string fullPath;
        try
        {
            fullPath = Path.GetFullPath(candidate);
        }
        catch (Exception ex)
        {
            throw new SmbServiceException(SmbErrorCode.InvalidPath, "Invalid UNC path.", ex);
        }

        if (!fullPath.StartsWith("\\\\", StringComparison.Ordinal))
        {
            throw new SmbServiceException(SmbErrorCode.InvalidPath, "Only UNC paths are allowed.");
        }

        var normalizedPath = TrimEndingDirectorySeparatorPreservingUncRoot(fullPath);
        var root = GetUncRoot(normalizedPath);

        if (!normalizedPath.Equals(root, StringComparison.OrdinalIgnoreCase) &&
            !normalizedPath.StartsWith(root + "\\", StringComparison.OrdinalIgnoreCase))
        {
            throw new SmbServiceException(SmbErrorCode.InvalidPath, "Path is outside of UNC root.");
        }

        return normalizedPath;
    }

    private static string TrimEndingDirectorySeparatorPreservingUncRoot(string path)
    {
        var normalized = path.Replace('/', '\\');
        var root = GetUncRoot(normalized);
        if (normalized.Equals(root, StringComparison.OrdinalIgnoreCase))
        {
            return root;
        }

        return normalized.TrimEnd('\\');
    }

    private static string GetUncRoot(string path)
    {
        var trimmed = path.Trim();
        if (!trimmed.StartsWith("\\\\", StringComparison.Ordinal))
        {
            throw new SmbServiceException(SmbErrorCode.InvalidPath, "Only UNC paths are allowed.");
        }

        var parts = trimmed.TrimStart('\\').Split('\\', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0)
        {
            throw new SmbServiceException(SmbErrorCode.InvalidPath, "Invalid UNC path.");
        }

        return parts.Length == 1
            ? $@"\\{parts[0]}"
            : $@"\\{parts[0]}\{parts[1]}";
    }
}
