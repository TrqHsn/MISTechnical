using Microsoft.AspNetCore.Mvc;
using System.Drawing;
using System.Drawing.Printing;
using ADApi.Helpers;

namespace ADApi.Controllers;

[ApiController]
[Route("api/print")]
[System.Runtime.Versioning.SupportedOSPlatform("windows")]
public class LabelPrintController : ControllerBase
{
    private readonly ILogger<LabelPrintController> _logger;
    private readonly IWebHostEnvironment _environment;

    public LabelPrintController(ILogger<LabelPrintController> logger, IWebHostEnvironment environment)
    {
        _logger = logger;
        _environment = environment;
    }

    [HttpPost("label")]
    public IActionResult PrintLabel([FromBody] LabelRequest request)
    {
        try
        {
            PrintDocument pd = new PrintDocument();

            pd.PrinterSettings.PrinterName = "SEWOO Label Printer"; // Adjust printer name as needed

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

            pd.PrintPage += (s, e) =>
            {
                if (e.Graphics == null) return;
                
                RectangleF area = e.MarginBounds;
                float pageWidth = e.PageBounds.Width;

                using Font font = new Font(
                    request.FontFamily ?? "Arial",
                    request.FontSize ?? 8,
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
