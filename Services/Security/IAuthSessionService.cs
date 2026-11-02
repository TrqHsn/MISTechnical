using ADApi.Models.Security;
using ADApi.Models.Security.Contracts;

namespace ADApi.Services.Security;

public interface IAuthSessionService
{
    Task<AuthOperationResult?> LoginAsync(
        string username,
        string password,
        string? remoteAddress,
        CancellationToken cancellationToken);

    Task<AuthOperationResult?> RefreshAsync(
        string refreshToken,
        CancellationToken cancellationToken);

    Task RevokeRefreshTokenAsync(string? refreshToken, CancellationToken cancellationToken);
    Task RevokeAllSessionsAsync(string userId, CancellationToken cancellationToken);
    Task RevokeOtherSessionsAsync(string userId, string currentSessionId, CancellationToken cancellationToken);
    Task<AuthUserResponse> GetUserResponseAsync(ApplicationUser user, CancellationToken cancellationToken);
}
