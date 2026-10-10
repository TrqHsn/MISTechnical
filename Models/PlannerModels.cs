namespace ADApi.Models;

public sealed class PlannerData
{
    public List<PlannerTask> FixedTasks { get; set; } = [];
    public List<PlannerWeek> Weeks { get; set; } = [];
}

public sealed class PlannerWeek
{
    public string WeekStart { get; set; } = string.Empty;
    public List<PlannerTask> Tasks { get; set; } = [];
    public List<ImportantTask> ImportantTasks { get; set; } = [];
    public string Notes { get; set; } = string.Empty;
}

public sealed class PlannerTask
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = "NeedBased";
    public int Day { get; set; }
    public string Start { get; set; } = "07:30";
    public string End { get; set; } = "07:45";
    public string Notes { get; set; } = string.Empty;
    public string Status { get; set; } = "Planned";
}

public sealed class ImportantTask
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public string Status { get; set; } = "Planned";
}
