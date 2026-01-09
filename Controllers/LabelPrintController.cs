using Microsoft.AspNetCore.Mvc;
using System.Drawing;
using System.Drawing.Printing;

namespace ADApi.Controllers;

[ApiController]
[Route("api/print")]
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

            pd.PrinterSettings.PrinterName = "Sewoo LK-24";

            // 60x15 mm → hundredths of inch
            pd.DefaultPageSettings.PaperSize = new PaperSize("Label60x15", 236, 59);
            pd.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);

            pd.PrintPage += (s, e) =>
            {
                RectangleF area = e.PageBounds;

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

                string text1 = request.Text1 ?? "";
                string text2 = request.Text2 ?? "";

                if (request.Caps)
                {
                    text1 = text1.ToUpper();
                    text2 = text2.ToUpper();
                }

                // Draw both lines centered
                float midY = area.Height / 2;
                float spacing = font.Height;

                // Top line
                RectangleF rect1 = new RectangleF(
                    area.X,
                    midY - spacing,
                    area.Width,
                    spacing
                );

                // Bottom line
                RectangleF rect2 = new RectangleF(
                    area.X,
                    midY,
                    area.Width,
                    spacing
                );

                e.Graphics.DrawString(text1, font, Brushes.Black, rect1, format);
                e.Graphics.DrawString(text2, font, Brushes.Black, rect2, format);

                e.HasMorePages = false;
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
