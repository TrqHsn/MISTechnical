using ADApi.Models;

namespace ADApi.Services;

public interface IComputerOuMoverService
{
    Task<IReadOnlyList<UnassignedComputerResponse>> GetUnassignedComputersAsync(CancellationToken cancellationToken);
    Task<ComputerMoveResponse> MoveComputerAsync(Guid objectGuid, CancellationToken cancellationToken);
}
