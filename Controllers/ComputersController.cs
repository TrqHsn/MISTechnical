using Microsoft.AspNetCore.Mvc;
using ADApi.Services;
using ADApi.Models;
using System.Net;

namespace ADApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ComputersController : ControllerBase
{
    private readonly IActiveDirectoryService _adService;
    private readonly IComputerOuMoverService _computerOuMover;
    private readonly ILogger<ComputersController> _logger;

    public ComputersController(
        IActiveDirectoryService adService,
        IComputerOuMoverService computerOuMover,
        ILogger<ComputersController> logger)
    {
        _adService = adService;
        _computerOuMover = computerOuMover;
        _logger = logger;
    }

    /// <summary>Lists computer objects directly inside the domain's default Computers container.</summary>
    [HttpGet("unassigned")]
    public async Task<ActionResult<IReadOnlyList<UnassignedComputerResponse>>> GetUnassignedComputers(
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _computerOuMover.GetUnassignedComputersAsync(cancellationToken));
        }
        catch (ComputerOuMoverException ex)
        {
            _logger.LogWarning(ex, "Unable to list unassigned computers");
            return StatusCode((int)ex.StatusCode, new { error = "Unable to list unassigned computers", message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Active Directory failed while listing unassigned computers");
            return StatusCode(500, new
            {
                error = "Active Directory request failed",
                message = "Unable to list computers. Verify Active Directory connectivity and the API process account's permissions."
            });
        }
    }

    /// <summary>Moves an eligible unassigned computer to its server-selected destination OU.</summary>
    [HttpPost("unassigned/{objectGuid}/move")]
    public async Task<ActionResult<ComputerMoveResponse>> MoveUnassignedComputer(
        string objectGuid,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(objectGuid, out var parsedGuid) || parsedGuid == Guid.Empty)
            return BadRequest(new { error = "Invalid computer identifier", message = "A valid computer object GUID is required." });

        try
        {
            return Ok(await _computerOuMover.MoveComputerAsync(parsedGuid, cancellationToken));
        }
        catch (ComputerOuMoverException ex)
        {
            _logger.LogWarning(ex, "Unable to move computer with object GUID {ObjectGuid}", parsedGuid);
            return StatusCode((int)ex.StatusCode, new { error = "Computer move failed", message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Active Directory failed while moving computer with object GUID {ObjectGuid}", parsedGuid);
            return StatusCode(500, new
            {
                error = "Active Directory move failed",
                message = "The computer could not be moved. Verify Active Directory connectivity, destination OUs, and the API process account's permissions."
            });
        }
    }

    /// <summary>
    /// Search computers by name or description
    /// </summary>
    /// <param name="searchTerm">Search term to find computers by name or description</param>
    /// <returns>List of matching computers</returns>
    [HttpGet("search")]
    public async Task<ActionResult<List<ComputerDto>>> SearchComputers([FromQuery] string searchTerm)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(searchTerm))
            {
                return BadRequest("Search term cannot be empty");
            }

            var computers = await _adService.SearchComputersByNameAsync(searchTerm);
            return Ok(computers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching computers");
            return StatusCode(500, new { error = "An error occurred while searching computers", message = ex.Message });
        }
    }

    /// <summary>
    /// Get computer details by name
    /// </summary>
    /// <param name="computerName">Computer name</param>
    /// <returns>Computer details</returns>
    [HttpGet("{computerName}")]
    public async Task<ActionResult<ComputerDto>> GetComputer(string computerName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(computerName))
            {
                return BadRequest("Computer name cannot be empty");
            }

            var computer = await _adService.GetComputerByNameAsync(computerName);
            
            if (computer == null)
            {
                return NotFound($"Computer with name '{computerName}' not found");
            }

            return Ok(computer);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting computer");
            return StatusCode(500, new { error = "An error occurred while getting computer", message = ex.Message });
        }
    }

    /// <summary>
    /// Update computer description
    /// </summary>
    /// <param name="computerName">Computer name</param>
    /// <param name="description">New description</param>
    /// <returns>Success message</returns>
    [HttpPut("{computerName}/description")]
    public async Task<ActionResult> UpdateComputerDescription(string computerName, [FromBody] string description)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(computerName))
            {
                return BadRequest("Computer name cannot be empty");
            }

            await _adService.UpdateComputerDescriptionAsync(computerName, description ?? "");
            return Ok(new { message = $"Computer '{computerName}' description updated successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating computer description");
            return StatusCode(500, new { error = "An error occurred while updating computer description", message = ex.Message });
        }
        }

        /// <summary>
        /// Partially update computer description (accepts JSON object { "description": "..." }) and returns updated computer
        /// </summary>
        /// <param name="computerName">Computer name</param>
        /// <param name="body">Object containing the new description</param>
        /// <returns>Updated computer details</returns>
        [HttpPatch("{computerName}/description")]
        public async Task<ActionResult<ComputerDto>> PatchUpdateComputerDescription(string computerName, [FromBody] UpdateDescriptionDto body)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(computerName))
                {
                    return BadRequest("Computer name cannot be empty");
                }

                var description = body?.Description ?? "";
                await _adService.UpdateComputerDescriptionAsync(computerName, description);

                var computer = await _adService.GetComputerByNameAsync(computerName);
                if (computer == null)
                {
                    return NotFound($"Computer with name '{computerName}' not found after update");
                }

                return Ok(computer);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating computer description");
                return StatusCode(500, new { error = "An error occurred while updating computer description", message = ex.Message });
            }
        }
    }

