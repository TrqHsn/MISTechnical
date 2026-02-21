using ADApi.Models;

namespace ADApi.Services;

public interface ISmbService
{
    Task<SmbBrowseResponseDto> BrowseAsync(string uncPath, CancellationToken cancellationToken = default);
    Task<(Stream Stream, string FileName, long Length, string ContentType)> OpenFileReadStreamAsync(string uncPath, CancellationToken cancellationToken = default);
    Task<string> GetValidatedFolderPathAsync(string uncPath, CancellationToken cancellationToken = default);
    Task StreamFolderAsZipAsync(string folderPath, Stream output, CancellationToken cancellationToken = default);
    Task<string> ResolveDefaultShareAsync(string serverPath, CancellationToken cancellationToken = default);
}
