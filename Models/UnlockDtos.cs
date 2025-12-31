namespace ADApi.Models;

public class UnlockFailureDto
{
    // SamAccountName which failed to unlock
    public string SamAccountName { get; set; } = string.Empty;

    // Reason for failure
    public string Reason { get; set; } = string.Empty;
}

public class UnlockResultDto
{
    // List of SAM account names that were unlocked successfully
    public List<string> Unlocked { get; set; } = new List<string>();

    // List of failures with reasons
    public List<UnlockFailureDto> Failed { get; set; } = new List<UnlockFailureDto>();
}

public class UnlockUserResultDto
{
    public string SamAccountName { get; set; } = string.Empty;
    public bool Success { get; set; }
    public string? Message { get; set; }
}