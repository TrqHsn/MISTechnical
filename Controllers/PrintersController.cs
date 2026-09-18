using System.Diagnostics;
using System.Runtime.Versioning;
using Microsoft.AspNetCore.Mvc;

namespace ADApi.Controllers;

[ApiController]
[Route("api/printers")]
[SupportedOSPlatform("windows")]
public sealed class PrintersController : ControllerBase
{
    private const string PrintServer = "sdldc9";
    private const long MaxPdfSize = 25L * 1024 * 1024;
    private readonly ILogger<PrintersController> _logger;
    private readonly SemaphoreSlim _printLock = new(1, 1);

    public PrintersController(ILogger<PrintersController> logger)
    {
        _logger = logger;
    }

    [HttpGet]
    public IActionResult GetPrinters()
    {
        try
        {
            return Ok(DiscoverPrinters());
        }
        catch (UnauthorizedAccessException ex)
        {
            _logger.LogError(ex, "Permission denied while discovering printers on \\\\{PrintServer}", PrintServer);
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Unable to access the print server." });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogError(ex, "Unable to connect to print server \\\\{PrintServer}", PrintServer);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Unable to connect to the print server." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Printer discovery failed for \\\\{PrintServer}", PrintServer);
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Unable to discover printers." });
        }
    }

    [HttpPost("print")]
    [RequestSizeLimit(MaxPdfSize)]
    public async Task<IActionResult> PrintPdf(
        [FromForm] IFormFile? file,
        [FromForm] string? printerName,
        CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { error = "No PDF selected." });
        }

        if (file.Length > MaxPdfSize)
        {
            return BadRequest(new { error = "The PDF is too large. Maximum size is 25 MB." });
        }

        if (!string.Equals(Path.GetExtension(file.FileName), ".pdf", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { error = "Only PDF files are supported." });
        }

        if (string.IsNullOrWhiteSpace(printerName))
        {
            return BadRequest(new { error = "Printer not found." });
        }

        string selectedPrinter;
        try
        {
            selectedPrinter = DiscoverPrinters()
                .FirstOrDefault(name => string.Equals(name, printerName.Trim(), StringComparison.OrdinalIgnoreCase))
                ?? throw new PrinterNotFoundException();
        }
        catch (PrinterNotFoundException)
        {
            return BadRequest(new { error = "Printer not found." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to validate printer {PrinterName}", printerName);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Unable to connect to the print server." });
        }

        var temporaryPdf = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid():N}.pdf");
        try
        {
            await using (var output = System.IO.File.Create(temporaryPdf))
            {
                await file.CopyToAsync(output, cancellationToken);
            }

            if (!await HasPdfSignatureAsync(temporaryPdf, cancellationToken))
            {
                return BadRequest(new { error = "The selected file is not a valid PDF." });
            }

            await _printLock.WaitAsync(cancellationToken);
            try
            {
                var acrobatPath = FindAcrobatPath();
                if (acrobatPath is null)
                {
                    return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Adobe Acrobat was not found." });
                }

                var printerPath = $@"\\{PrintServer}\{selectedPrinter}";
                var temporaryPrinterConnected = false;
                try
                {
                    await ConnectTemporaryPrinterAsync(printerPath, cancellationToken);
                    temporaryPrinterConnected = true;

                    var startInfo = new ProcessStartInfo
                    {
                        FileName = acrobatPath,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                    };
                    startInfo.ArgumentList.Add("/t");
                    startInfo.ArgumentList.Add(temporaryPdf);
                    startInfo.ArgumentList.Add(printerPath);

                    using var process = Process.Start(startInfo);
                    if (process is null)
                    {
                        return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Unable to send the print job." });
                    }

                    try
                    {
                        await process.WaitForExitAsync(cancellationToken).WaitAsync(TimeSpan.FromSeconds(30), cancellationToken);
                    }
                    catch (TimeoutException)
                    {
                        _logger.LogWarning("Acrobat did not exit within the print wait period for {PrinterPath}", printerPath);
                    }

                    _logger.LogInformation("Submitted PDF {FileName} to {PrinterPath}", file.FileName, printerPath);
                    return Ok(new { message = "Print job submitted successfully." });
                }
                finally
                {
                    if (temporaryPrinterConnected)
                    {
                        await DisconnectTemporaryPrinterAsync(printerPath);
                    }
                }
            }
            finally
            {
                _printLock.Release();
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return BadRequest(new { error = "The print request was cancelled." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to send PDF {FileName} to printer {PrinterName}", file.FileName, selectedPrinter);
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Unable to send the print job." });
        }
        finally
        {
            _ = DeleteTemporaryFileAsync(temporaryPdf);
        }
    }

    private static List<string> DiscoverPrinters()
    {
        var serverPath = $@"\\{PrintServer}";
        var startInfo = new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.SystemDirectory, "net.exe"),
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        startInfo.ArgumentList.Add("view");
        startInfo.ArgumentList.Add(serverPath);

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Unable to start Windows printer discovery.");
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Windows could not enumerate shares on {serverPath}. {error.GetAwaiter().GetResult().Trim()}");
        }

        var printerNames = new List<string>();
        foreach (var line in output.GetAwaiter().GetResult().Split(Environment.NewLine))
        {
            var columns = line.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            if (columns.Length >= 2 &&
                string.Equals(columns[1], "Print", StringComparison.OrdinalIgnoreCase))
            {
                printerNames.Add(columns[0].Trim());
            }
        }

        return printerNames
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static async Task ConnectTemporaryPrinterAsync(string printerPath, CancellationToken cancellationToken)
    {
        await RunPrintUiAsync("/in", printerPath, cancellationToken);
    }

    private async Task DisconnectTemporaryPrinterAsync(string printerPath)
    {
        try
        {
            await RunPrintUiAsync("/dn", printerPath, CancellationToken.None);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Unable to remove temporary printer connection {PrinterPath}", printerPath);
        }
    }

    private static async Task RunPrintUiAsync(string action, string printerPath, CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.SystemDirectory, "rundll32.exe"),
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        startInfo.ArgumentList.Add("printui.dll,PrintUIEntry");
        startInfo.ArgumentList.Add(action);
        startInfo.ArgumentList.Add("/n");
        startInfo.ArgumentList.Add(printerPath);

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Unable to start the Windows printer connection process.");
        await process.WaitForExitAsync(cancellationToken);
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"Windows printer operation failed with exit code {process.ExitCode}.");
        }
    }

    private static async Task<bool> HasPdfSignatureAsync(string path, CancellationToken cancellationToken)
    {
        var header = new byte[5];
        await using var stream = System.IO.File.OpenRead(path);
        var read = await stream.ReadAsync(header.AsMemory(0, header.Length), cancellationToken);
        return read == header.Length && header.SequenceEqual("%PDF-"u8.ToArray());
    }

    private static string? FindAcrobatPath()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Adobe", "Acrobat DC", "Acrobat", "Acrobat.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Adobe", "Acrobat DC", "Acrobat", "Acrobat.exe"),
        };

        return candidates.FirstOrDefault(System.IO.File.Exists);
    }

    private static async Task DeleteTemporaryFileAsync(string path)
    {
        await Task.Delay(TimeSpan.FromSeconds(30));
        try
        {
            if (System.IO.File.Exists(path))
            {
                System.IO.File.Delete(path);
            }
        }
        catch
        {
        }
    }

    private sealed class PrinterNotFoundException : Exception;
}
