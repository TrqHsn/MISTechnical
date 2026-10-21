namespace ADApi.Models;

/// <summary>Represents a computer currently located in the domain's default Computers container.</summary>
public sealed record UnassignedComputerResponse(
    Guid ObjectGuid,
    string Name,
    string? Destination,
    string? DestinationPath,
    string? DestinationDistinguishedName);

/// <summary>Confirms a computer move completed successfully.</summary>
public sealed record ComputerMoveResponse(
    string Name,
    string Destination,
    string DestinationPath,
    string DestinationDistinguishedName,
    string Message);
