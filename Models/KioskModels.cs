namespace ADApi.Models;

/// <summary>
/// Represents a media file (image or video) stored in the kiosk system
/// </summary>
public class MediaItem
{
    public int Id { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public MediaType Type { get; set; }
    public long FileSizeBytes { get; set; }
    public DateTime UploadedAt { get; set; }
    public string? Description { get; set; }
}

/// <summary>
/// Type of media (image or video)
/// </summary>
public enum MediaType
{
    Image,
    Video,
    PDF
}

/// <summary>
/// Represents a playlist containing multiple media items
/// </summary>
public class Playlist
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public List<PlaylistItem> Items { get; set; } = new();
}

/// <summary>
/// A single item in a playlist with display duration
/// </summary>
public class PlaylistItem
{
    public int Id { get; set; }
    public int PlaylistId { get; set; }
    public int MediaId { get; set; }
    public int DurationSeconds { get; set; } = 10;
    public int Order { get; set; }
    public MediaItem? Media { get; set; }
}

/// <summary>
/// Schedule for displaying content at specific times
/// </summary>
public class Schedule
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public ScheduleContentType ContentType { get; set; }
    public int? PlaylistId { get; set; }
    public int? MediaId { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public DayOfWeek? DayOfWeek { get; set; } // null means every day
    public bool IsActive { get; set; } = true;
    public int Priority { get; set; } = 0; // Higher priority wins if schedules overlap
    
    public Playlist? Playlist { get; set; }
    public MediaItem? Media { get; set; }
}

/// <summary>
/// Type of content in a schedule
/// </summary>
public enum ScheduleContentType
{
    Playlist,
    SingleImage
}

/// <summary>
/// DTO for creating/updating a playlist
/// </summary>
public class CreatePlaylistDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<PlaylistItemDto> Items { get; set; } = new();
}

/// <summary>
/// DTO for playlist items
/// </summary>
public class PlaylistItemDto
{
    public int MediaId { get; set; }
    public int DurationSeconds { get; set; } = 10;
    public int Order { get; set; }
}

/// <summary>
/// DTO for creating a schedule
/// </summary>
public class CreateScheduleDto
{
    public string Name { get; set; } = string.Empty;
    public ScheduleContentType ContentType { get; set; }
    public int? PlaylistId { get; set; }
    public int? MediaId { get; set; }
    public string StartTime { get; set; } = string.Empty; // HH:mm format
    public string EndTime { get; set; } = string.Empty;   // HH:mm format
    public DayOfWeek? DayOfWeek { get; set; }
    public int Priority { get; set; } = 0;
}

/// <summary>
/// Response sent to the TV display containing current active content
/// </summary>
public class ActiveContentResponse
{
    public string ContentType { get; set; } = string.Empty; // "playlist" or "image"
    public int? PlaylistId { get; set; }
    public List<ActiveMediaItem>? PlaylistItems { get; set; }
    public ActiveMediaItem? SingleMedia { get; set; }
    public DateTime ServerTime { get; set; }
    public string? ScheduleName { get; set; }
    public string DisplayMode { get; set; } = "cover"; // Global display mode setting (fill, contain, cover, scale-down, none)
    public bool ShouldReload { get; set; } = false; // Signal TV displays to reload
    public DateTime? ReloadTimestamp { get; set; } // Timestamp of last reload command
}

/// <summary>
/// Media item with URL for display
/// </summary>
public class ActiveMediaItem
{
    public int MediaId { get; set; }
    public string Url { get; set; } = string.Empty;
    public MediaType Type { get; set; }
    public int DurationSeconds { get; set; }
    public string FileName { get; set; } = string.Empty;
}

/// <summary>
/// Response for media upload
/// </summary>
public class UploadMediaResponse
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public MediaItem? Media { get; set; }
}

/// <summary>
/// DTO for heartbeat from TV display
/// </summary>
public class DisplayHeartbeatDto
{
    public string DisplayId { get; set; } = string.Empty;
    public DateTime ClientTime { get; set; }
    public string? CurrentContent { get; set; }
}

/// <summary>
/// DTO for global display settings
/// </summary>
public class DisplaySettingsDto
{
    public string DisplayMode { get; set; } = "cover"; // fill, contain, cover, scale-down, none
}
