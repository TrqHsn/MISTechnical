using Microsoft.AspNetCore.Mvc;
using System.Drawing;
using System.Drawing.Printing;
using ADApi.Helpers;
using System.Text;

namespace ADApi.Controllers;

[ApiController]
[Route("api/print")]
[System.Runtime.Versioning.SupportedOSPlatform("windows")]
public class LabelPrintController : ControllerBase
{
    private readonly ILogger<LabelPrintController> _logger;
    private readonly IWebHostEnvironment _environment;
    private readonly string _labelPrinterName;

    public LabelPrintController(ILogger<LabelPrintController> logger, IWebHostEnvironment environment, IConfiguration configuration)
    {
        _logger = logger;
        _environment = environment;
        _labelPrinterName = configuration["PrinterSettings:LabelPrinterName"] ?? "SEWOO Label Printer";
    }

    [HttpGet("guest-wifi")]
    public IActionResult GetGuestWifi()
    {
        try
        {
            var filePath = GetGuestWifiFilePath();
            if (!System.IO.File.Exists(filePath))
            {
                return NotFound(new { error = "Guest Wi-Fi file not found", message = filePath });
            }

            var lines = System.IO.File.ReadAllLines(filePath);
            var ssid = lines.Length > 0 && !string.IsNullOrWhiteSpace(lines[0]) ? lines[0].Trim() : "Guest@Dewhirst";
            var password = lines.Length > 1 && !string.IsNullOrWhiteSpace(lines[1]) ? lines[1].Trim() : "";

            return Ok(new { ssid, password });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading guest Wi-Fi file");
            return StatusCode(500, new { error = "Read failed", message = ex.Message });
        }
    }

    [HttpPost("guest-wifi")]
    public IActionResult UpdateGuestWifiPassword([FromBody] GuestWifiUpdateRequest request)
    {
        try
        {
            var filePath = GetGuestWifiFilePath();
            var directory = Path.GetDirectoryName(filePath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            var ssid = "Guest@Dewhirst";
            var password = request?.Password ?? "";

            if (System.IO.File.Exists(filePath))
            {
                var existingLines = System.IO.File.ReadAllLines(filePath);
                if (existingLines.Length > 0 && !string.IsNullOrWhiteSpace(existingLines[0]))
                {
                    ssid = existingLines[0].Trim();
                }
                if (existingLines.Length > 1 && !string.IsNullOrWhiteSpace(existingLines[1]))
                {
                    password = request?.Password ?? existingLines[1].Trim();
                }
            }

            var content = new StringBuilder();
            content.AppendLine(ssid);
            content.AppendLine(password);
            System.IO.File.WriteAllText(filePath, content.ToString());

            return Ok(new { ssid, password });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating guest Wi-Fi file");
            return StatusCode(500, new { error = "Update failed", message = ex.Message });
        }
    }

    [HttpPost("label")]
    public IActionResult PrintLabel([FromBody] LabelRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(_labelPrinterName))
            {
                throw new InvalidOperationException("PrinterSettings:LabelPrinterName is not configured.");
            }

            var installedPrinters = PrinterSettings.InstalledPrinters.Cast<string>().ToList();
            if (!installedPrinters.Contains(_labelPrinterName, StringComparer.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"Printer '{_labelPrinterName}' is not installed on this Windows server. Installed printers: {string.Join(", ", installedPrinters)}");
            }

            PrintDocument pd = new PrintDocument();
            pd.PrinterSettings.PrinterName = _labelPrinterName;

            // 60x15 mm → hundredths of inch
            pd.DefaultPageSettings.PaperSize = new PaperSize("Label60x15", 236, 59);
            pd.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);

            int currentPage = 0;
            string text1 = request.Text1 ?? "";
            string text2 = request.Text2 ?? "";

            if (request.Caps)
            {
                text1 = text1.ToUpper();
                text2 = text2.ToUpper();
            }

            var resolvedFontName = NormalizeWindowsFontName(request.FontFamily);
            var resolvedFontSize = request.FontSize is > 0 ? request.FontSize.Value : 24f;
            if (resolvedFontSize < 6) resolvedFontSize = 6;
            if (resolvedFontSize > 72) resolvedFontSize = 72;

            pd.PrintPage += (s, e) =>
            {
                if (e.Graphics == null) return;
                
                RectangleF area = e.MarginBounds;
                float pageWidth = e.PageBounds.Width;

                using Font font = new Font(
                    resolvedFontName,
                    resolvedFontSize,
                    request.Bold ? FontStyle.Bold : FontStyle.Regular
                );

                StringFormat format = new StringFormat
                {
                    Alignment = StringAlignment.Center,
                    LineAlignment = StringAlignment.Center
                };

                // Calculate vertical positioning
                float lineHeight = font.Height;
                float offsetY = 8f; // Offset to avoid top clipping
                float startY = ((area.Height - lineHeight) / 2) + offsetY;

                // Single line centered on the label
                RectangleF rect = new RectangleF(
                    0,
                    startY,
                    pageWidth,
                    lineHeight
                );

                // Print current page text
                string textToPrint = currentPage == 0 ? text1 : text2;
                e.Graphics.DrawString(textToPrint, font, Brushes.Black, rect, format);

                currentPage++;

                // Print second page if both text1 and text2 exist
                bool hasText1 = !string.IsNullOrWhiteSpace(text1);
                bool hasText2 = !string.IsNullOrWhiteSpace(text2);
                
                if (hasText1 && hasText2 && currentPage == 1)
                {
                    e.HasMorePages = true;
                }
                else
                {
                    e.HasMorePages = false;
                }
            };

            pd.Print();

            _logger.LogInformation("Label printed successfully");
            return Ok(new { message = "Printed successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error printing label");
            return StatusCode(500, new { error = "Print failed", message = ex.Message });
        }
    }

    [HttpPost("generate-docx")]
    public IActionResult GenerateDocx([FromBody] NewUserAssignRequest request)
    {
        try
        {
            var templatePath = Path.Combine(_environment.WebRootPath ?? _environment.ContentRootPath, "NewUserAssign.docx");
            
            if (!System.IO.File.Exists(templatePath))
            {
                // Try MIS/public folder
                templatePath = Path.Combine(_environment.ContentRootPath, "MIS", "public", "NewUserAssign.docx");
            }

            if (!System.IO.File.Exists(templatePath))
            {
                return NotFound(new { error = "Template not found", message = "NewUserAssign.docx template file not found" });
            }

            var placeholders = new Dictionary<string, string>
            {
                { "{{firstName}}", request.FirstName ?? "" },
                { "{{lastName}}", request.LastName ?? "" },
                { "{{section}}", request.Section ?? "" },
                { "{{department}}", request.Department ?? "" },
                { "{{pro1}}", request.Pro1 ?? "" },
                { "{{pro2}}", request.Pro2 ?? "" },
                { "{{pro3}}", request.Pro3 ?? "" },
                { "{{pro4}}", request.Pro4 ?? "" },
                { "{{pro5}}", request.Pro5 ?? "" },
                { "{{con1}}", request.Con1 ?? "" },
                { "{{con2}}", request.Con2 ?? "" },
                { "{{con3}}", request.Con3 ?? "" },
                { "{{con4}}", request.Con4 ?? "" },
                { "{{con5}}", request.Con5 ?? "" },
                { "{{r1}}", request.R1 ?? "" },
                { "{{r2}}", request.R2 ?? "" },
                { "{{r3}}", request.R3 ?? "" },
                { "{{r4}}", request.R4 ?? "" },
                { "{{r5}}", request.R5 ?? "" },
                { "{{rpro1}}", request.RPro1 ?? "" },
                { "{{rpro2}}", request.RPro2 ?? "" },
                { "{{rpro3}}", request.RPro3 ?? "" },
                { "{{rpro4}}", request.RPro4 ?? "" },
                { "{{rpro5}}", request.RPro5 ?? "" },
                { "{{rcon1}}", request.RCon1 ?? "" },
                { "{{rcon2}}", request.RCon2 ?? "" },
                { "{{rcon3}}", request.RCon3 ?? "" },
                { "{{rcon4}}", request.RCon4 ?? "" },
                { "{{rcon5}}", request.RCon5 ?? "" },
                { "{{rr1}}", request.RR1 ?? "" },
                { "{{rr2}}", request.RR2 ?? "" },
                { "{{rr3}}", request.RR3 ?? "" },
                { "{{rr4}}", request.RR4 ?? "" },
                { "{{rr5}}", request.RR5 ?? "" }
            };

            var docxBytes = DocxHelper.FillTemplate(templatePath, placeholders);

            _logger.LogInformation("DOCX generated successfully for {FirstName} {LastName}", request.FirstName, request.LastName);
            
            return File(docxBytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
                $"{request.FirstName} {request.LastName} assign form.docx");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating DOCX");
            return StatusCode(500, new { error = "Generation failed", message = ex.Message });
        }
    }

    [HttpPost("silent-print")]
    public IActionResult SilentPrint([FromBody] NewUserAssignRequest request)
    {
        try
        {
            var templatePath = Path.Combine(_environment.WebRootPath ?? _environment.ContentRootPath, "NewUserAssign.docx");
            
            if (!System.IO.File.Exists(templatePath))
            {
                templatePath = Path.Combine(_environment.ContentRootPath, "MIS", "public", "NewUserAssign.docx");
            }

            if (!System.IO.File.Exists(templatePath))
            {
                return NotFound(new { error = "Template not found", message = "NewUserAssign.docx template file not found" });
            }

            var placeholders = new Dictionary<string, string>
            {
                { "{{firstName}}", request.FirstName ?? "" },
                { "{{lastName}}", request.LastName ?? "" },
                { "{{section}}", request.Section ?? "" },
                { "{{department}}", request.Department ?? "" },
                { "{{pro1}}", request.Pro1 ?? "" },
                { "{{pro2}}", request.Pro2 ?? "" },
                { "{{pro3}}", request.Pro3 ?? "" },
                { "{{pro4}}", request.Pro4 ?? "" },
                { "{{pro5}}", request.Pro5 ?? "" },
                { "{{con1}}", request.Con1 ?? "" },
                { "{{con2}}", request.Con2 ?? "" },
                { "{{con3}}", request.Con3 ?? "" },
                { "{{con4}}", request.Con4 ?? "" },
                { "{{con5}}", request.Con5 ?? "" },
                { "{{r1}}", request.R1 ?? "" },
                { "{{r2}}", request.R2 ?? "" },
                { "{{r3}}", request.R3 ?? "" },
                { "{{r4}}", request.R4 ?? "" },
                { "{{r5}}", request.R5 ?? "" },
                { "{{rpro1}}", request.RPro1 ?? "" },
                { "{{rpro2}}", request.RPro2 ?? "" },
                { "{{rpro3}}", request.RPro3 ?? "" },
                { "{{rpro4}}", request.RPro4 ?? "" },
                { "{{rpro5}}", request.RPro5 ?? "" },
                { "{{rcon1}}", request.RCon1 ?? "" },
                { "{{rcon2}}", request.RCon2 ?? "" },
                { "{{rcon3}}", request.RCon3 ?? "" },
                { "{{rcon4}}", request.RCon4 ?? "" },
                { "{{rcon5}}", request.RCon5 ?? "" },
                { "{{rr1}}", request.RR1 ?? "" },
                { "{{rr2}}", request.RR2 ?? "" },
                { "{{rr3}}", request.RR3 ?? "" },
                { "{{rr4}}", request.RR4 ?? "" },
                { "{{rr5}}", request.RR5 ?? "" }
            };

            var docxBytes = DocxHelper.FillTemplate(templatePath, placeholders);

            // Silent print to default printer
            var fileName = $"{request.FirstName}_{request.LastName}_assign.docx";
            PrintHelper.SilentPrint(docxBytes, fileName);

            _logger.LogInformation("Silent print successful for {FirstName} {LastName}", request.FirstName, request.LastName);
            
            return Ok(new { message = "Document sent to printer successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during silent print");
            return StatusCode(500, new { error = "Print failed", message = ex.Message });
        }
    }

    private static string NormalizeWindowsFontName(string? fontFamily)
    {
        var genericFonts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "serif", "sans-serif", "sans", "monospace", "cursive", "fantasy", "system-ui",
            "arial", "helvetica", "times", "times new roman", "courier", "courier new"
        };

        var candidates = (fontFamily ?? "Arial")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(name => name.Trim('"', '\''))
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .ToList();

        var firstRealFont = candidates.FirstOrDefault(name => !genericFonts.Contains(name));
        var resolved = firstRealFont ?? candidates.FirstOrDefault() ?? "Arial";
        return resolved;
    }

    private string GetGuestWifiFilePath()
    {
        var candidates = new[]
        {
            Path.Combine(_environment.WebRootPath ?? _environment.ContentRootPath, "GuestWiFi", "guestWiFi.txt"),
            Path.Combine(_environment.ContentRootPath, "MIS", "public", "GuestWiFi", "guestWiFi.txt"),
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "MIS", "public", "GuestWiFi", "guestWiFi.txt")
        };

        foreach (var candidate in candidates)
        {
            var fullPath = Path.GetFullPath(candidate);
            if (System.IO.File.Exists(fullPath))
            {
                return fullPath;
            }
        }

        return Path.GetFullPath(candidates[1]);
    }
}

public class LabelRequest
{
    public string? Text1 { get; set; }
    public string? Text2 { get; set; }
    public string? FontFamily { get; set; }
    public float? FontSize { get; set; }
    public bool Bold { get; set; }
    public bool Caps { get; set; }
}

public class GuestWifiUpdateRequest
{
    public string? Password { get; set; }
}

public class NewUserAssignRequest
{
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Section { get; set; }
    public string? Department { get; set; }
    public string? Pro1 { get; set; }
    public string? Pro2 { get; set; }
    public string? Pro3 { get; set; }
    public string? Pro4 { get; set; }
    public string? Pro5 { get; set; }
    public string? Con1 { get; set; }
    public string? Con2 { get; set; }
    public string? Con3 { get; set; }
    public string? Con4 { get; set; }
    public string? Con5 { get; set; }
    public string? R1 { get; set; }
    public string? R2 { get; set; }
    public string? R3 { get; set; }
    public string? R4 { get; set; }
    public string? R5 { get; set; }
    public string? RPro1 { get; set; }
    public string? RPro2 { get; set; }
    public string? RPro3 { get; set; }
    public string? RPro4 { get; set; }
    public string? RPro5 { get; set; }
    public string? RCon1 { get; set; }
    public string? RCon2 { get; set; }
    public string? RCon3 { get; set; }
    public string? RCon4 { get; set; }
    public string? RCon5 { get; set; }
    public string? RR1 { get; set; }
    public string? RR2 { get; set; }
    public string? RR3 { get; set; }
    public string? RR4 { get; set; }
    public string? RR5 { get; set; }
}
