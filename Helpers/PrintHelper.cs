using System.Diagnostics;
using System.Runtime.Versioning;

namespace ADApi.Helpers;

[SupportedOSPlatform("windows")]
public static class PrintHelper
{
    public static void SilentPrint(byte[] fileBytes, string fileName)
    {
        // Save to temp file
        var tempPath = Path.Combine(Path.GetTempPath(), fileName);
        File.WriteAllBytes(tempPath, fileBytes);

        try
        {
            // Use Windows default print command
            var processInfo = new ProcessStartInfo
            {
                FileName = tempPath,
                Verb = "print",
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                UseShellExecute = true
            };

            using var process = Process.Start(processInfo);
            if (process != null)
            {
                // Wait a bit for the print job to spool
                Thread.Sleep(3000);
            }
        }
        finally
        {
            // Cleanup temp file after a delay
            Task.Run(async () =>
            {
                await Task.Delay(5000);
                try
                {
                    if (File.Exists(tempPath))
                        File.Delete(tempPath);
                }
                catch
                {
                    // Ignore cleanup errors
                }
            });
        }
    }
}
