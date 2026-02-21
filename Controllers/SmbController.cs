using ADApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace ADApi.Controllers;

[ApiController]
[Route("api/smb")]
public class SmbController : ControllerBase
{
    private readonly ISmbService _smbService;
    private readonly ILogger<SmbController> _logger;

    public SmbController(ISmbService smbService, ILogger<SmbController> logger)
    {
        _smbService = smbService;
        _logger = logger;
    }

    [HttpGet("browse")]
    public async Task<IActionResult> Browse([FromQuery] string path, CancellationToken cancellationToken)
    {
        try
        {
            // Auto-resolve server-only paths to default share
            var resolvedPath = await _smbService.ResolveDefaultShareAsync(path, cancellationToken);
            var result = await _smbService.BrowseAsync(resolvedPath, cancellationToken);
            return Ok(result);
        }
        catch (SmbServiceException ex)
        {
            return HandleSmbServiceException(ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while browsing SMB path {Path}", path);
            return StatusCode(500, new { error = "Internal server error", message = "Failed to browse SMB path." });
        }
    }

    [HttpGet("download/file")]
    public async Task<IActionResult> DownloadFile([FromQuery] string path, CancellationToken cancellationToken)
    {
        try
        {
            var (stream, fileName, _, contentType) = await _smbService.OpenFileReadStreamAsync(path, cancellationToken);
            return File(stream, contentType, fileName, enableRangeProcessing: true);
        }
        catch (SmbServiceException ex)
        {
            return HandleSmbServiceException(ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while downloading SMB file {Path}", path);
            return StatusCode(500, new { error = "Internal server error", message = "Failed to download file." });
        }
    }

    [HttpGet("download/folder")]
    public async Task<IActionResult> DownloadFolder([FromQuery] string path, CancellationToken cancellationToken)
    {
        try
        {
            var validatedFolderPath = await _smbService.GetValidatedFolderPathAsync(path, cancellationToken);
            var folderName = GetSafeFolderName(validatedFolderPath);

            return new FileCallbackResult("application/zip", async (outputStream, _) =>
            {
                await _smbService.StreamFolderAsZipAsync(validatedFolderPath, outputStream, cancellationToken);
            })
            {
                FileDownloadName = $"{folderName}.zip"
            };
        }
        catch (SmbServiceException ex)
        {
            return HandleSmbServiceException(ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error while downloading SMB folder {Path}", path);
            return StatusCode(500, new { error = "Internal server error", message = "Failed to download folder." });
        }
    }

    private class FileCallbackResult : FileResult
    {
        private readonly Func<Stream, ActionContext, Task> _callback;

        public FileCallbackResult(string contentType, Func<Stream, ActionContext, Task> callback)
            : base(contentType)
        {
            _callback = callback ?? throw new ArgumentNullException(nameof(callback));
        }

        public override Task ExecuteResultAsync(ActionContext context)
        {
            var executor = new FileCallbackResultExecutor();
            return executor.ExecuteAsync(context, this);
        }

        private class FileCallbackResultExecutor
        {
            public async Task ExecuteAsync(ActionContext context, FileCallbackResult result)
            {
                var response = context.HttpContext.Response;
                response.ContentType = result.ContentType;

                if (!string.IsNullOrEmpty(result.FileDownloadName))
                {
                    response.Headers["Content-Disposition"] = $"attachment; filename=\"{result.FileDownloadName}\"";
                }

                await result._callback(response.Body, context);
            }
        }
    }

    private IActionResult HandleSmbServiceException(SmbServiceException ex)
    {
        _logger.LogWarning(ex, "SMB request failed with {Code}: {Message}", ex.Code, ex.Message);

        return ex.Code switch
        {
            SmbErrorCode.InvalidPath => BadRequest(new { error = "invalid_path", message = ex.Message }),
            SmbErrorCode.NotFound => NotFound(new { error = "not_found", message = ex.Message }),
            SmbErrorCode.AccessDenied => StatusCode(StatusCodes.Status403Forbidden, new { error = "access_denied", message = ex.Message }),
            SmbErrorCode.NetworkUnavailable => StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "network_unavailable", message = ex.Message }),
            _ => StatusCode(500, new { error = "internal_error", message = "SMB operation failed." })
        };
    }

    private static string GetSafeFolderName(string folderPath)
    {
        var name = Path.GetFileName(folderPath.TrimEnd('\\'));
        if (string.IsNullOrWhiteSpace(name))
        {
            return "folder";
        }

        foreach (var c in Path.GetInvalidFileNameChars())
        {
            name = name.Replace(c, '_');
        }

        return name;
    }
}
