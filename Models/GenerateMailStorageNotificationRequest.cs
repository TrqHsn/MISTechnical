using System.ComponentModel.DataAnnotations;

namespace ADApi.Models;

/// <summary>Request to create one unsent mail-storage notification draft.</summary>
public sealed record GenerateMailStorageNotificationRequest
{
    [Required]
    [RegularExpression(@"^[A-Za-z0-9._-]{1,20}$")]
    public required string SamAccountName { get; init; }

    [Required]
    [RegularExpression(@"^(Archive Mail|Mailbox)$")]
    public required string Category { get; init; }

    [Required]
    [StringLength(100000, MinimumLength = 1)]
    public required string HtmlBody { get; init; }

    public bool IncludeManagerInCc { get; init; } = true;
}
