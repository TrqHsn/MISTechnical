using Microsoft.AspNetCore.Mvc;
using System.Drawing;
using System.Drawing.Printing;

namespace ADApi.Controllers;

[ApiController]
[Route("api/print")]
[System.Runtime.Versioning.SupportedOSPlatform("windows")]
public class LabelPrintController : ControllerBase
{
    private readonly ILogger<LabelPrintController> _logger;

    public LabelPrintController(ILogger<LabelPrintController> logger)
    {
        _logger = logger;
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
