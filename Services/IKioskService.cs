using ADApi.Models;

namespace ADApi.Services;

/// <summary>
/// Service for managing kiosk/digital signage content, playlists, and schedules
/// </summary>
public interface IKioskService
{
    // Media management
    Task<MediaItem?> SaveMediaAsync(IFormFile file, string? description);
    Task<List<MediaItem>> GetAllMediaAsync();
    Task<MediaItem?> GetMediaByIdAsync(int id);
    Task<bool> DeleteMediaAsync(int id);
    
    // Playlist management
    Task<Playlist> CreatePlaylistAsync(CreatePlaylistDto dto);
    Task<Playlist?> UpdatePlaylistAsync(int id, CreatePlaylistDto dto);
    Task<List<Playlist>> GetAllPlaylistsAsync();
    Task<Playlist?> GetPlaylistByIdAsync(int id);
    Task<bool> DeletePlaylistAsync(int id);
    
    // Schedule management
    Task<Schedule> CreateScheduleAsync(CreateScheduleDto dto);
    Task<Schedule?> UpdateScheduleAsync(int id, CreateScheduleDto dto);
    Task<List<Schedule>> GetAllSchedulesAsync();
    Task<Schedule?> GetScheduleByIdAsync(int id);
    Task<bool> DeleteScheduleAsync(int id);
    Task<bool> ToggleScheduleAsync(int id, bool isActive);
    
    // Direct activation (bypass schedules)
    Task<bool> ActivateMediaNowAsync(int mediaId);
    Task<bool> DeactivateMediaAsync();
    
    // Content resolution for TV display
    Task<ActiveContentResponse> GetActiveContentAsync();
    
    // Heartbeat tracking (optional, for monitoring)
    Task RecordHeartbeatAsync(DisplayHeartbeatDto heartbeat);
}
