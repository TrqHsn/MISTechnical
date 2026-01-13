using Microsoft.AspNetCore.Mvc;
using ADApi.Services;
using ADApi.Models;

namespace ADApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class KioskController : ControllerBase
{
    private readonly IKioskService _kioskService;
    private readonly ILogger<KioskController> _logger;

    public KioskController(IKioskService kioskService, ILogger<KioskController> logger)
    {
        _kioskService = kioskService;
        _logger = logger;
    }

    #region Media Endpoints

    /// <summary>
    /// Upload a media file (image or video)
    /// </summary>
    [HttpPost("media/upload")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<UploadMediaResponse>> UploadMedia(IFormFile file, string? description = null)
    {
        try
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new UploadMediaResponse 
                { 
                    Success = false, 
                    Message = "No file provided" 
                });
            }

            var media = await _kioskService.SaveMediaAsync(file, description);
            
            if (media == null)
            {
                return BadRequest(new UploadMediaResponse 
                { 
                    Success = false, 
                    Message = "Failed to save media file. Check file type and size." 
                });
            }

            return Ok(new UploadMediaResponse 
            { 
                Success = true, 
                Message = "Media uploaded successfully",
                Media = media
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading media");
            return StatusCode(500, new UploadMediaResponse 
            { 
                Success = false, 
                Message = "Internal server error during upload" 
            });
        }
    }

    /// <summary>
    /// Get all media files
    /// </summary>
    [HttpGet("media")]
    public async Task<ActionResult<List<MediaItem>>> GetAllMedia()
    {
        try
        {
            var media = await _kioskService.GetAllMediaAsync();
            return Ok(media);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving media");
            return StatusCode(500, new { error = "Failed to retrieve media" });
        }
    }

    /// <summary>
    /// Get media by ID
    /// </summary>
    [HttpGet("media/{id}")]
    public async Task<ActionResult<MediaItem>> GetMedia(int id)
    {
        try
        {
            var media = await _kioskService.GetMediaByIdAsync(id);
            if (media == null)
                return NotFound(new { error = "Media not found" });

            return Ok(media);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving media {MediaId}", id);
            return StatusCode(500, new { error = "Failed to retrieve media" });
        }
    }

    /// <summary>
    /// Delete media file
    /// </summary>
    [HttpDelete("media/{id}")]
    public async Task<ActionResult> DeleteMedia(int id)
    {
        try
        {
            var success = await _kioskService.DeleteMediaAsync(id);
            if (!success)
                return NotFound(new { error = "Media not found" });

            return Ok(new { message = "Media deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting media {MediaId}", id);
            return StatusCode(500, new { error = "Failed to delete media" });
        }
    }

    /// <summary>
    /// Activate media for immediate display (bypasses schedules)
    /// </summary>
    [HttpPost("media/{id}/activate")]
    public async Task<ActionResult> ActivateMedia(int id)
    {
        try
        {
            var success = await _kioskService.ActivateMediaNowAsync(id);
            if (!success)
                return NotFound(new { error = "Media not found" });

            return Ok(new { message = "Media activated for display", mediaId = id });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error activating media {MediaId}", id);
            return StatusCode(500, new { error = "Failed to activate media" });
        }
    }

    /// <summary>
    /// Deactivate direct media display (resume scheduled content)
    /// </summary>
    [HttpPost("media/deactivate")]
    public async Task<ActionResult> DeactivateMedia()
    {
        try
        {
            await _kioskService.DeactivateMediaAsync();
            return Ok(new { message = "Direct activation cleared, resumed scheduled content" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deactivating media");
            return StatusCode(500, new { error = "Failed to deactivate media" });
        }
    }

    #endregion

    #region Playlist Endpoints

    /// <summary>
    /// Create a new playlist
    /// </summary>
    [HttpPost("playlists")]
    public async Task<ActionResult<Playlist>> CreatePlaylist([FromBody] CreatePlaylistDto dto)
    {
        try
        {
            var playlist = await _kioskService.CreatePlaylistAsync(dto);
            return CreatedAtAction(nameof(GetPlaylist), new { id = playlist.Id }, playlist);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating playlist");
            return StatusCode(500, new { error = "Failed to create playlist" });
        }
    }

    /// <summary>
    /// Update an existing playlist
    /// </summary>
    [HttpPut("playlists/{id}")]
    public async Task<ActionResult<Playlist>> UpdatePlaylist(int id, [FromBody] CreatePlaylistDto dto)
    {
        try
        {
            var playlist = await _kioskService.UpdatePlaylistAsync(id, dto);
            if (playlist == null)
                return NotFound(new { error = "Playlist not found" });

            return Ok(playlist);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating playlist {PlaylistId}", id);
            return StatusCode(500, new { error = "Failed to update playlist" });
        }
    }

    /// <summary>
    /// Get all playlists
    /// </summary>
    [HttpGet("playlists")]
    public async Task<ActionResult<List<Playlist>>> GetAllPlaylists()
    {
        try
        {
            var playlists = await _kioskService.GetAllPlaylistsAsync();
            return Ok(playlists);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving playlists");
            return StatusCode(500, new { error = "Failed to retrieve playlists" });
        }
    }

    /// <summary>
    /// Get playlist by ID
    /// </summary>
    [HttpGet("playlists/{id}")]
    public async Task<ActionResult<Playlist>> GetPlaylist(int id)
    {
        try
        {
            var playlist = await _kioskService.GetPlaylistByIdAsync(id);
            if (playlist == null)
                return NotFound(new { error = "Playlist not found" });

            return Ok(playlist);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving playlist {PlaylistId}", id);
            return StatusCode(500, new { error = "Failed to retrieve playlist" });
        }
    }

    /// <summary>
    /// Delete a playlist
    /// </summary>
    [HttpDelete("playlists/{id}")]
    public async Task<ActionResult> DeletePlaylist(int id)
    {
        try
        {
            var success = await _kioskService.DeletePlaylistAsync(id);
            if (!success)
                return NotFound(new { error = "Playlist not found" });

            return Ok(new { message = "Playlist deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting playlist {PlaylistId}", id);
            return StatusCode(500, new { error = "Failed to delete playlist" });
        }
    }

    #endregion

    #region Schedule Endpoints

    /// <summary>
    /// Create a new schedule
    /// </summary>
    [HttpPost("schedules")]
    public async Task<ActionResult<Schedule>> CreateSchedule([FromBody] CreateScheduleDto dto)
    {
        try
        {
            var schedule = await _kioskService.CreateScheduleAsync(dto);
            return CreatedAtAction(nameof(GetSchedule), new { id = schedule.Id }, schedule);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating schedule");
            return StatusCode(500, new { error = "Failed to create schedule", message = ex.Message });
        }
    }

    /// <summary>
    /// Update an existing schedule
    /// </summary>
    [HttpPut("schedules/{id}")]
    public async Task<ActionResult<Schedule>> UpdateSchedule(int id, [FromBody] CreateScheduleDto dto)
    {
        try
        {
            var schedule = await _kioskService.UpdateScheduleAsync(id, dto);
            if (schedule == null)
                return NotFound(new { error = "Schedule not found" });

            return Ok(schedule);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating schedule {ScheduleId}", id);
            return StatusCode(500, new { error = "Failed to update schedule" });
        }
    }

    /// <summary>
    /// Get all schedules
    /// </summary>
    [HttpGet("schedules")]
    public async Task<ActionResult<List<Schedule>>> GetAllSchedules()
    {
        try
        {
            var schedules = await _kioskService.GetAllSchedulesAsync();
            return Ok(schedules);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving schedules");
            return StatusCode(500, new { error = "Failed to retrieve schedules" });
        }
    }

    /// <summary>
    /// Get schedule by ID
    /// </summary>
    [HttpGet("schedules/{id}")]
    public async Task<ActionResult<Schedule>> GetSchedule(int id)
    {
        try
        {
            var schedule = await _kioskService.GetScheduleByIdAsync(id);
            if (schedule == null)
                return NotFound(new { error = "Schedule not found" });

            return Ok(schedule);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving schedule {ScheduleId}", id);
            return StatusCode(500, new { error = "Failed to retrieve schedule" });
        }
    }

    /// <summary>
    /// Delete a schedule
    /// </summary>
    [HttpDelete("schedules/{id}")]
    public async Task<ActionResult> DeleteSchedule(int id)
    {
        try
        {
            var success = await _kioskService.DeleteScheduleAsync(id);
            if (!success)
                return NotFound(new { error = "Schedule not found" });

            return Ok(new { message = "Schedule deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting schedule {ScheduleId}", id);
            return StatusCode(500, new { error = "Failed to delete schedule" });
        }
    }

    /// <summary>
    /// Toggle schedule active status
    /// </summary>
    [HttpPatch("schedules/{id}/toggle")]
    public async Task<ActionResult> ToggleSchedule(int id, [FromBody] bool isActive)
    {
        try
        {
            var success = await _kioskService.ToggleScheduleAsync(id, isActive);
            if (!success)
                return NotFound(new { error = "Schedule not found" });

            return Ok(new { message = $"Schedule {(isActive ? "activated" : "deactivated")} successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error toggling schedule {ScheduleId}", id);
            return StatusCode(500, new { error = "Failed to toggle schedule" });
        }
    }

    #endregion

    #region Display Content Endpoint

    /// <summary>
    /// Get current active content for TV display
    /// This is the critical endpoint that the TV polls
    /// </summary>
    [HttpGet("display/content")]
    public async Task<ActionResult<ActiveContentResponse>> GetActiveContent()
    {
        try
        {
            var content = await _kioskService.GetActiveContentAsync();
            return Ok(content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving active content");
            return StatusCode(500, new { error = "Failed to retrieve active content" });
        }
    }

    /// <summary>
    /// Record heartbeat from TV display (for monitoring)
    /// </summary>
    [HttpPost("display/heartbeat")]
    public async Task<ActionResult> RecordHeartbeat([FromBody] DisplayHeartbeatDto heartbeat)
    {
        try
        {
            await _kioskService.RecordHeartbeatAsync(heartbeat);
            return Ok(new { message = "Heartbeat recorded" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error recording heartbeat");
            return StatusCode(500, new { error = "Failed to record heartbeat" });
        }
    }

    #endregion
}
