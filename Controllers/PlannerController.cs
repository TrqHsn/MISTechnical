using System.Text;
using System.Text.Json;
using ADApi.Models;
using Microsoft.AspNetCore.Mvc;

namespace ADApi.Controllers;

[ApiController]
[Route("api/planner")]
public sealed class PlannerController : ControllerBase
{
    private static readonly SemaphoreSlim FileLock = new(1, 1);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };
    private readonly string _filePath;
    private readonly ILogger<PlannerController> _logger;

    public PlannerController(IWebHostEnvironment environment, ILogger<PlannerController> logger)
    {
        _filePath = Path.Combine(environment.ContentRootPath, "work-planner.json");
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<PlannerData>> Get(CancellationToken cancellationToken)
    {
        try
        {
            var data = await ReadAsync(cancellationToken);
            MaterializeWeek(data, DateOnly.FromDateTime(DateTime.Today));
            await WriteAsync(data, cancellationToken);
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to load planner data");
            return StatusCode(500, new { error = "Unable to load planner data", message = ex.Message });
        }
    }

    [HttpGet("week/{weekStart}")]
    public async Task<ActionResult<PlannerWeek>> GetWeek(string weekStart, CancellationToken cancellationToken)
    {
        if (!DateOnly.TryParse(weekStart, out var date))
            return BadRequest(new { error = "weekStart must be an ISO date" });

        try
        {
            var data = await ReadAsync(cancellationToken);
            var week = MaterializeWeek(data, date);
            await WriteAsync(data, cancellationToken);
            return Ok(week);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to load planner week {WeekStart}", weekStart);
            return StatusCode(500, new { error = "Unable to load planner week", message = ex.Message });
        }
    }

    [HttpPut]
    public async Task<IActionResult> Save([FromBody] PlannerData data, CancellationToken cancellationToken)
    {
        try
        {
            await WriteAsync(data, cancellationToken);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to save planner data");
            return StatusCode(500, new { error = "Unable to save planner data", message = ex.Message });
        }
    }

    [HttpPost("report/{weekStart}")]
    public async Task<IActionResult> Report(string weekStart, CancellationToken cancellationToken)
    {
        if (!DateOnly.TryParse(weekStart, out var date))
            return BadRequest(new { error = "weekStart must be an ISO date" });
        if (DateTime.Now.DayOfWeek == DayOfWeek.Friday ||
            (DateTime.Now.DayOfWeek == DayOfWeek.Thursday && DateTime.Now.TimeOfDay >= new TimeSpan(16, 30, 0)))
        {
            // Reports are available after the work week. Historical weeks remain reportable.
        }
        else if (date == GetWeekStart(DateOnly.FromDateTime(DateTime.Today)))
        {
            return BadRequest(new { error = "The current week's report is available after Thursday at 4:30 PM." });
        }

        try
        {
            var data = await ReadAsync(cancellationToken);
            var week = MaterializeWeek(data, date);
            var pdf = BuildPdf(data, week, date);
            return File(pdf, "application/pdf", $"weekly-work-planner-{date:yyyy-MM-dd}.pdf");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to generate planner report");
            return StatusCode(500, new { error = "Unable to generate planner report", message = ex.Message });
        }
    }

    private async Task<PlannerData> ReadAsync(CancellationToken cancellationToken)
    {
        await FileLock.WaitAsync(cancellationToken);
        try
        {
            if (!System.IO.File.Exists(_filePath))
            {
                var empty = new PlannerData();
                await WriteUnsafeAsync(empty, cancellationToken);
                return empty;
            }

            await using var stream = System.IO.File.OpenRead(_filePath);
            return await JsonSerializer.DeserializeAsync<PlannerData>(stream, JsonOptions, cancellationToken)
                ?? new PlannerData();
        }
        finally { FileLock.Release(); }
    }

    private async Task WriteAsync(PlannerData data, CancellationToken cancellationToken)
    {
        await FileLock.WaitAsync(cancellationToken);
        try { await WriteUnsafeAsync(data, cancellationToken); }
        finally { FileLock.Release(); }
    }

    private async Task WriteUnsafeAsync(PlannerData data, CancellationToken cancellationToken)
    {
        var directory = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        await using var stream = System.IO.File.Create(_filePath);
        await JsonSerializer.SerializeAsync(stream, data, JsonOptions, cancellationToken);
    }

    private static PlannerWeek MaterializeWeek(PlannerData data, DateOnly requestedDate)
    {
        var weekStart = GetWeekStart(requestedDate);
        var key = weekStart.ToString("yyyy-MM-dd");
        var week = data.Weeks.FirstOrDefault(w => w.WeekStart == key);
        if (week is null)
        {
            week = new PlannerWeek { WeekStart = key };
            data.Weeks.Add(week);
        }

        foreach (var fixedTask in data.FixedTasks)
        {
            if (week.Tasks.All(t => t.Id != fixedTask.Id))
                week.Tasks.Add(Clone(fixedTask));
        }
        return week;
    }

    private static PlannerTask Clone(PlannerTask task) => new()
    {
        Id = task.Id, Name = task.Name, Category = "Fixed", Day = task.Day,
        Start = task.Start, End = task.End, Notes = task.Notes, Status = task.Status
    };

    private static DateOnly GetWeekStart(DateOnly date)
    {
        var daysFromSaturday = ((int)date.DayOfWeek + 1) % 7;
        return date.AddDays(-daysFromSaturday);
    }

    private static byte[] BuildPdf(PlannerData data, PlannerWeek week, DateOnly weekStart)
    {
        var lines = new List<string>
        {
            "WEEKLY WORK PLANNER",
            $"Week: {weekStart:yyyy-MM-dd} - {weekStart.AddDays(5):yyyy-MM-dd}",
            $"Generated: {DateTime.Now:yyyy-MM-dd HH:mm}",
            ""
        };
        foreach (var task in week.Tasks.OrderBy(t => t.Day).ThenBy(t => t.Start))
            lines.Add($"{DayName(task.Day)} {task.Start}-{task.End} [{task.Category}] {task.Name} ({task.Status})");
        lines.Add("");
        lines.Add($"Fixed tasks: {week.Tasks.Count(t => t.Category == "Fixed")}");
        lines.Add($"Need-based tasks: {week.Tasks.Count(t => t.Category != "Fixed")}");
        lines.Add($"Completed tasks: {week.Tasks.Count(t => t.Status == "Completed")}");
        lines.Add($"Planned tasks: {week.Tasks.Count(t => t.Status == "Planned")}");
        lines.Add($"Total scheduled time: {week.Tasks.Sum(t => Math.Max(0, ParseMinutes(t.End) - ParseMinutes(t.Start)))} minutes");
        lines.Add("");
        lines.Add("IMPORTANT TASKS");
        lines.AddRange(week.ImportantTasks.Select(t => $"- {t.Name} ({t.Status}) {t.Notes}"));
        lines.Add("");
        lines.Add("NOTES");
        lines.AddRange((week.Notes ?? string.Empty).Split('\n'));
        return CreateTextPdf(lines);
    }

    private static string DayName(int day) => new[] { "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday" }[Math.Clamp(day, 0, 5)];
    private static int ParseMinutes(string value)
    {
        return TimeSpan.TryParse(value, out var time) ? (int)time.TotalMinutes : 0;
    }

    private static byte[] CreateTextPdf(IEnumerable<string> lines)
    {
        var content = new StringBuilder("BT\n/F1 10 Tf\n50 560 Td\n");
        foreach (var line in lines)
        {
            content.Append($"({EscapePdf(line)}) Tj\n0 -14 Td\n");
        }
        content.Append("ET");
        var objects = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            $"<< /Length {Encoding.ASCII.GetByteCount(content.ToString())} >>\nstream\n{content}\nendstream"
        };
        using var output = new MemoryStream();
        using var writer = new StreamWriter(output, Encoding.ASCII, leaveOpen: true);
        writer.Write("%PDF-1.4\n");
        var offsets = new List<long> { 0 };
        for (var i = 0; i < objects.Length; i++)
        {
            writer.Flush();
            offsets.Add(output.Position);
            writer.Write($"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
        }
        writer.Flush();
        var xref = output.Position;
        writer.Write($"xref\n0 {objects.Length + 1}\n0000000000 65535 f \n");
        foreach (var offset in offsets.Skip(1)) writer.Write($"{offset:0000000000} 00000 n \n");
        writer.Write($"trailer\n<< /Size {objects.Length + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF");
        writer.Flush();
        return output.ToArray();
    }

    private static string EscapePdf(string value) => value.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
}
