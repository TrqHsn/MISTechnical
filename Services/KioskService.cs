using ADApi.Models;
using System.Collections.Concurrent;
using System.Text.Json;

namespace ADApi.Services;

/// <summary>
/// In-memory implementation of kiosk service with JSON persistence
/// For production, replace with database-backed implementation
/// </summary>
public class KioskService : IKioskService
{
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<KioskService> _logger;
    private readonly string _mediaPath;
    private readonly string _dataPath;
    private static readonly object _saveLock = new();
    
    // In-memory storage with persistence
    private static int _nextMediaId = 1;
    private static int _nextPlaylistId = 1;
    private static int _nextScheduleId = 1;
    private static int? _activeMediaId = null; // For direct activation
    private static readonly ConcurrentDictionary<int, MediaItem> _media = new();
    private static readonly ConcurrentDictionary<int, Playlist> _playlists = new();
    private static readonly ConcurrentDictionary<int, Schedule> _schedules = new();
    private static readonly ConcurrentDictionary<string, DateTime> _heartbeats = new();
    private static bool _dataLoaded = false;

    public KioskService(IWebHostEnvironment environment, ILogger<KioskService> logger)
    {
        _environment = environment;
        _logger = logger;
        _mediaPath = Path.Combine(_environment.WebRootPath ?? "wwwroot", "displayboard");
        _dataPath = Path.Combine(_environment.WebRootPath ?? "wwwroot", "displayboard", "data");
        
        // Ensure directories exist
        Directory.CreateDirectory(_mediaPath);
        Directory.CreateDirectory(_dataPath);
        
        // Load persisted data on first initialization
        if (!_dataLoaded)
        {
            LoadData();
            _dataLoaded = true;
        }
    }

    #region Media Management

    public async Task<MediaItem?> SaveMediaAsync(IFormFile file, string? description)
    {
        try
        {
            if (file.Length == 0)
                return null;

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".mp4", ".webm" };
            
            if (!allowedExtensions.Contains(extension))
            {
                _logger.LogWarning("Invalid file extension: {Extension}", extension);
                return null;
            }

            var fileName = $"{Guid.NewGuid()}{extension}";
            var filePath = Path.Combine(_mediaPath, fileName);

            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            var mediaType = extension == ".mp4" || extension == ".webm" ? MediaType.Video : MediaType.Image;
            
            var mediaItem = new MediaItem
            {
                Id = _nextMediaId++,
                FileName = fileName,
                OriginalFileName = file.FileName,
                Type = mediaType,
                FileSizeBytes = file.Length,
                UploadedAt = DateTime.UtcNow,
                Description = description
            };

            _media[mediaItem.Id] = mediaItem;
            SaveData();
            _logger.LogInformation("Media uploaded: {FileName} (ID: {Id})", fileName, mediaItem.Id);
            
            return mediaItem;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving media file");
            return null;
        }
    }

    public Task<List<MediaItem>> GetAllMediaAsync()
    {
        return Task.FromResult(_media.Values.OrderByDescending(m => m.UploadedAt).ToList());
    }

    public Task<MediaItem?> GetMediaByIdAsync(int id)
    {
        _media.TryGetValue(id, out var media);
        return Task.FromResult(media);
    }

    public Task<bool> DeleteMediaAsync(int id)
    {
        try
        {
            if (!_media.TryRemove(id, out var media))
                return Task.FromResult(false);

            var filePath = Path.Combine(_mediaPath, media.FileName);
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }

            // Remove from playlists
            foreach (var playlist in _playlists.Values)
            {
                playlist.Items.RemoveAll(item => item.MediaId == id);
            }

            SaveData();
            _logger.LogInformation("Media deleted: {FileName} (ID: {Id})", media.FileName, id);
            return Task.FromResult(true);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting media {MediaId}", id);
            return Task.FromResult(false);
        }
    }

    #endregion

    #region Playlist Management

    public Task<Playlist> CreatePlaylistAsync(CreatePlaylistDto dto)
    {
        var playlist = new Playlist
        {
            Id = _nextPlaylistId++,
            Name = dto.Name,
            Description = dto.Description,
            CreatedAt = DateTime.UtcNow,
            Items = dto.Items.Select((item, index) => new PlaylistItem
            {
                Id = index + 1,
                MediaId = item.MediaId,
                DurationSeconds = item.DurationSeconds,
                Order = item.Order
            }).ToList()
        };

        // Attach media items
        foreach (var item in playlist.Items)
        {
            _media.TryGetValue(item.MediaId, out var media);
            item.Media = media;
        }

        _playlists[playlist.Id] = playlist;
        SaveData();
        _logger.LogInformation("Playlist created: {Name} (ID: {Id})", playlist.Name, playlist.Id);
        
        return Task.FromResult(playlist);
    }

    public Task<Playlist?> UpdatePlaylistAsync(int id, CreatePlaylistDto dto)
    {
        if (!_playlists.TryGetValue(id, out var playlist))
            return Task.FromResult<Playlist?>(null);

        playlist.Name = dto.Name;
        playlist.Description = dto.Description;
        playlist.UpdatedAt = DateTime.UtcNow;
        playlist.Items = dto.Items.Select((item, index) => new PlaylistItem
        {
            Id = index + 1,
            PlaylistId = id,
            MediaId = item.MediaId,
            DurationSeconds = item.DurationSeconds,
            Order = item.Order
        }).ToList();

        // Attach media items
        foreach (var item in playlist.Items)
        {
            _media.TryGetValue(item.MediaId, out var media);
            item.Media = media;
        }

        _logger.LogInformation("Playlist updated: {Name} (ID: {Id})", playlist.Name, id);
        return Task.FromResult<Playlist?>(playlist);
    }

    public Task<List<Playlist>> GetAllPlaylistsAsync()
    {
        var playlists = _playlists.Values.OrderByDescending(p => p.CreatedAt).ToList();
        
        // Ensure media items are attached
        foreach (var playlist in playlists)
        {
            foreach (var item in playlist.Items)
            {
                _media.TryGetValue(item.MediaId, out var media);
                item.Media = media;
            }
        }
        
        return Task.FromResult(playlists);
    }

    public Task<Playlist?> GetPlaylistByIdAsync(int id)
    {
        if (!_playlists.TryGetValue(id, out var playlist))
            return Task.FromResult<Playlist?>(null);

        // Attach media items
        foreach (var item in playlist.Items)
        {
            _media.TryGetValue(item.MediaId, out var media);
            item.Media = media;
        }

        return Task.FromResult<Playlist?>(playlist);
    }

    public Task<bool> DeletePlaylistAsync(int id)
    {
        if (_playlists.TryRemove(id, out var playlist))
        {
            _logger.LogInformation("Playlist deleted: {Name} (ID: {Id})", playlist.Name, id);
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    #endregion

    #region Schedule Management

    public Task<Schedule> CreateScheduleAsync(CreateScheduleDto dto)
    {
        var schedule = new Schedule
        {
            Id = _nextScheduleId++,
            Name = dto.Name,
            ContentType = dto.ContentType,
            PlaylistId = dto.PlaylistId,
            MediaId = dto.MediaId,
            StartTime = TimeOnly.Parse(dto.StartTime),
            EndTime = TimeOnly.Parse(dto.EndTime),
            DayOfWeek = dto.DayOfWeek,
            Priority = dto.Priority,
            IsActive = true
        };

        _schedules[schedule.Id] = schedule;
        SaveData();
        _logger.LogInformation("Schedule created: {Name} (ID: {Id})", schedule.Name, schedule.Id);
        
        return Task.FromResult(schedule);
    }

    public Task<Schedule?> UpdateScheduleAsync(int id, CreateScheduleDto dto)
    {
        if (!_schedules.TryGetValue(id, out var schedule))
            return Task.FromResult<Schedule?>(null);

        schedule.Name = dto.Name;
        schedule.ContentType = dto.ContentType;
        schedule.PlaylistId = dto.PlaylistId;
        schedule.MediaId = dto.MediaId;
        schedule.StartTime = TimeOnly.Parse(dto.StartTime);
        schedule.EndTime = TimeOnly.Parse(dto.EndTime);
        schedule.DayOfWeek = dto.DayOfWeek;
        schedule.Priority = dto.Priority;

        _logger.LogInformation("Schedule updated: {Name} (ID: {Id})", schedule.Name, id);
        return Task.FromResult<Schedule?>(schedule);
    }

    public Task<List<Schedule>> GetAllSchedulesAsync()
    {
        return Task.FromResult(_schedules.Values.OrderBy(s => s.StartTime).ToList());
    }

    public Task<Schedule?> GetScheduleByIdAsync(int id)
    {
        _schedules.TryGetValue(id, out var schedule);
        return Task.FromResult(schedule);
    }

    public Task<bool> DeleteScheduleAsync(int id)
    {
        if (_schedules.TryRemove(id, out var schedule))
        {
            _logger.LogInformation("Schedule deleted: {Name} (ID: {Id})", schedule.Name, id);
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    public Task<bool> ToggleScheduleAsync(int id, bool isActive)
    {
        if (_schedules.TryGetValue(id, out var schedule))
        {
            schedule.IsActive = isActive;
            _logger.LogInformation("Schedule {Id} set to {Status}", id, isActive ? "active" : "inactive");
            return Task.FromResult(true);
        }
        return Task.FromResult(false);
    }

    #endregion

    #region Content Resolution

    public async Task<ActiveContentResponse> GetActiveContentAsync()
    {
        // PRIORITY 1: Check for directly activated media (bypasses all schedules)
        if (_activeMediaId.HasValue && _media.TryGetValue(_activeMediaId.Value, out var activeMedia))
        {
            return new ActiveContentResponse
            {
                ContentType = "image",
                SingleMedia = new ActiveMediaItem
                {
                    MediaId = activeMedia.Id,
                    Url = $"/displayboard/{activeMedia.FileName}",
                    Type = activeMedia.Type,
                    DurationSeconds = 0,
                    FileName = activeMedia.FileName
                },
                ServerTime = DateTime.UtcNow,
                ScheduleName = "Direct Activation"
            };
        }

        // PRIORITY 2: Check scheduled content
        var now = DateTime.Now;
        var currentTime = TimeOnly.FromDateTime(now);
        var currentDay = now.DayOfWeek;

        // Find active schedules that match current time
        var activeSchedules = _schedules.Values
            .Where(s => s.IsActive)
            .Where(s => s.DayOfWeek == null || s.DayOfWeek == currentDay)
            .Where(s => IsTimeInRange(currentTime, s.StartTime, s.EndTime))
            .OrderByDescending(s => s.Priority)
            .ToList();

        var activeSchedule = activeSchedules.FirstOrDefault();

        if (activeSchedule != null)
        {
            _logger.LogDebug("Active schedule found: {Name}", activeSchedule.Name);
            
            if (activeSchedule.ContentType == ScheduleContentType.Playlist && activeSchedule.PlaylistId.HasValue)
            {
                var playlist = await GetPlaylistByIdAsync(activeSchedule.PlaylistId.Value);
                if (playlist != null && playlist.Items.Any())
                {
                    return new ActiveContentResponse
                    {
                        ContentType = "playlist",
                        PlaylistId = playlist.Id,
                        PlaylistItems = playlist.Items
                            .OrderBy(item => item.Order)
                            .Select(item => new ActiveMediaItem
                            {
                                MediaId = item.MediaId,
                                Url = $"/displayboard/{item.Media?.FileName}",
                                Type = item.Media?.Type ?? MediaType.Image,
                                DurationSeconds = item.DurationSeconds,
                                FileName = item.Media?.FileName ?? ""
                            }).ToList(),
                        ServerTime = DateTime.UtcNow,
                        ScheduleName = activeSchedule.Name
                    };
                }
            }
            else if (activeSchedule.ContentType == ScheduleContentType.SingleImage && activeSchedule.MediaId.HasValue)
            {
                var media = await GetMediaByIdAsync(activeSchedule.MediaId.Value);
                if (media != null)
                {
                    return new ActiveContentResponse
                    {
                        ContentType = "image",
                        SingleMedia = new ActiveMediaItem
                        {
                            MediaId = media.Id,
                            Url = $"/displayboard/{media.FileName}",
                            Type = media.Type,
                            DurationSeconds = 0, // Display indefinitely
                            FileName = media.FileName
                        },
                        ServerTime = DateTime.UtcNow,
                        ScheduleName = activeSchedule.Name
                    };
                }
            }
        }

        // Fallback: return first available playlist or first media item
        _logger.LogDebug("No active schedule, returning fallback content");
        
        var fallbackPlaylist = _playlists.Values.FirstOrDefault();
        if (fallbackPlaylist != null)
        {
            var playlist = await GetPlaylistByIdAsync(fallbackPlaylist.Id);
            if (playlist != null && playlist.Items.Any())
            {
                return new ActiveContentResponse
                {
                    ContentType = "playlist",
                    PlaylistId = playlist.Id,
                    PlaylistItems = playlist.Items
                        .OrderBy(item => item.Order)
                        .Select(item => new ActiveMediaItem
                        {
                            MediaId = item.MediaId,
                            Url = $"/displayboard/{item.Media?.FileName}",
                            Type = item.Media?.Type ?? MediaType.Image,
                            DurationSeconds = item.DurationSeconds,
                            FileName = item.Media?.FileName ?? ""
                        }).ToList(),
                    ServerTime = DateTime.UtcNow,
                    ScheduleName = "Fallback Playlist"
                };
            }
        }

        // Ultimate fallback
        var fallbackMedia = _media.Values.FirstOrDefault();
        if (fallbackMedia != null)
        {
            return new ActiveContentResponse
            {
                ContentType = "image",
                SingleMedia = new ActiveMediaItem
                {
                    MediaId = fallbackMedia.Id,
                    Url = $"/displayboard/{fallbackMedia.FileName}",
                    Type = fallbackMedia.Type,
                    DurationSeconds = 0,
                    FileName = fallbackMedia.FileName
                },
                ServerTime = DateTime.UtcNow,
                ScheduleName = "Fallback Image"
            };
        }

        // No content available
        return new ActiveContentResponse
        {
            ContentType = "none",
            ServerTime = DateTime.UtcNow
        };
    }

    private static bool IsTimeInRange(TimeOnly current, TimeOnly start, TimeOnly end)
    {
        // Handle ranges that cross midnight
        if (start <= end)
        {
            return current >= start && current <= end;
        }
        else
        {
            return current >= start || current <= end;
        }
    }

    #endregion

    #region Heartbeat

    public Task RecordHeartbeatAsync(DisplayHeartbeatDto heartbeat)
    {
        _heartbeats[heartbeat.DisplayId] = DateTime.UtcNow;
        _logger.LogDebug("Heartbeat from display: {DisplayId}", heartbeat.DisplayId);
        return Task.CompletedTask;
    }

    #endregion

    #region Direct Activation

    public Task<bool> ActivateMediaNowAsync(int mediaId)
    {
        if (!_media.ContainsKey(mediaId))
            return Task.FromResult(false);

        _activeMediaId = mediaId;
        SaveData();
        _logger.LogInformation("Media {MediaId} activated for immediate display", mediaId);
        return Task.FromResult(true);
    }

    public Task<bool> DeactivateMediaAsync()
    {
        _activeMediaId = null;
        SaveData();
        _logger.LogInformation("Direct media activation cleared");
        return Task.FromResult(true);
    }

    #endregion

    #region Data Persistence

    private void LoadData()
    {
        try
        {
            var mediaFile = Path.Combine(_dataPath, "media.json");
            var playlistsFile = Path.Combine(_dataPath, "playlists.json");
            var schedulesFile = Path.Combine(_dataPath, "schedules.json");
            var metaFile = Path.Combine(_dataPath, "meta.json");

            // Load media
            if (File.Exists(mediaFile))
            {
                var json = File.ReadAllText(mediaFile);
                var items = JsonSerializer.Deserialize<List<MediaItem>>(json);
                if (items != null)
                {
                    foreach (var item in items)
                    {
                        _media[item.Id] = item;
                        if (item.Id >= _nextMediaId)
                            _nextMediaId = item.Id + 1;
                    }
                    _logger.LogInformation("Loaded {Count} media items", items.Count);
                }
            }

            // Load playlists
            if (File.Exists(playlistsFile))
            {
                var json = File.ReadAllText(playlistsFile);
                var items = JsonSerializer.Deserialize<List<Playlist>>(json);
                if (items != null)
                {
                    foreach (var item in items)
                    {
                        // Restore media references
                        foreach (var playlistItem in item.Items)
                        {
                            if (_media.TryGetValue(playlistItem.MediaId, out var media))
                            {
                                playlistItem.Media = media;
                            }
                        }
                        _playlists[item.Id] = item;
                        if (item.Id >= _nextPlaylistId)
                            _nextPlaylistId = item.Id + 1;
                    }
                    _logger.LogInformation("Loaded {Count} playlists", items.Count);
                }
            }

            // Load schedules
            if (File.Exists(schedulesFile))
            {
                var json = File.ReadAllText(schedulesFile);
                var items = JsonSerializer.Deserialize<List<Schedule>>(json);
                if (items != null)
                {
                    foreach (var item in items)
                    {
                        _schedules[item.Id] = item;
                        if (item.Id >= _nextScheduleId)
                            _nextScheduleId = item.Id + 1;
                    }
                    _logger.LogInformation("Loaded {Count} schedules", items.Count);
                }
            }

            // Load metadata (active media, etc.)
            if (File.Exists(metaFile))
            {
                var json = File.ReadAllText(metaFile);
                var meta = JsonSerializer.Deserialize<Dictionary<string, int?>>(json);
                if (meta != null && meta.TryGetValue("activeMediaId", out var activeId))
                {
                    _activeMediaId = activeId;
                }
            }

            _logger.LogInformation("Data loaded successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading persisted data");
        }
    }

    private void SaveData()
    {
        try
        {
            lock (_saveLock)
            {
                var options = new JsonSerializerOptions { WriteIndented = true };

                // Save media
                var mediaFile = Path.Combine(_dataPath, "media.json");
                var mediaJson = JsonSerializer.Serialize(_media.Values.ToList(), options);
                File.WriteAllText(mediaFile, mediaJson);

                // Save playlists
                var playlistsFile = Path.Combine(_dataPath, "playlists.json");
                var playlistsCopy = _playlists.Values.Select(p => new Playlist
                {
                    Id = p.Id,
                    Name = p.Name,
                    CreatedAt = p.CreatedAt,
                    Items = p.Items.Select(i => new PlaylistItem
                    {
                        MediaId = i.MediaId,
                        DurationSeconds = i.DurationSeconds,
                        Order = i.Order,
                        Media = null
                    }).ToList()
                }).ToList();
                var playlistsJson = JsonSerializer.Serialize(playlistsCopy, options);
                File.WriteAllText(playlistsFile, playlistsJson);

                // Save schedules
                var schedulesFile = Path.Combine(_dataPath, "schedules.json");
                var schedulesJson = JsonSerializer.Serialize(_schedules.Values.ToList(), options);
                File.WriteAllText(schedulesFile, schedulesJson);

                // Save metadata
                var metaFile = Path.Combine(_dataPath, "meta.json");
                var meta = new Dictionary<string, int?> { { "activeMediaId", _activeMediaId } };
                var metaJson = JsonSerializer.Serialize(meta, options);
                File.WriteAllText(metaFile, metaJson);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving data");
        }
    }

    #endregion
}
