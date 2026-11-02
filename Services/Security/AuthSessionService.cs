using System.Security.Cryptography;
using System.Text;
using ADApi.Models.Security;
using ADApi.Models.Security.Contracts;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace ADApi.Services.Security;

public sealed class AuthSessionService(
    AuthDbContext db,
    UserManager<ApplicationUser> users,
    SignInManager<ApplicationUser> signInManager,
    AuthTokenService tokenService,
    ILogger<AuthSessionService> logger) : IAuthSessionService
{
    private static readonly TimeSpan MaximumSessionDuration = TimeSpan.FromHours(24);

    public async Task<AuthOperationResult?> LoginAsync(
        string username,
        string password,
        string? remoteAddress,
        CancellationToken cancellationToken)
    {
        var user = await users.FindByNameAsync(username);
        var loginSucceeded = false;
        if (user is { IsActive: true })
        {
            var signIn = await signInManager.CheckPasswordSignInAsync(user, password, lockoutOnFailure: true);
            loginSucceeded = signIn.Succeeded;
        }

        db.LoginHistory.Add(new LoginHistoryEntry
        {
            UserId = user?.Id,
            Username = username,
            Succeeded = loginSucceeded,
            RemoteAddress = remoteAddress
        });

        if (!loginSucceeded || user is null)
        {
            await db.SaveChangesAsync(cancellationToken);
            return null;
        }

        var now = DateTimeOffset.UtcNow;
        var session = new AuthSession
        {
            UserId = user.Id,
            CreatedAtUtc = now,
            OriginalExpiresAtUtc = now.Add(MaximumSessionDuration)
        };
        user.LastLoginAtUtc = now;
        db.AuthSessions.Add(session);
        var refreshToken = CreateRefreshTokenHash(out var refreshTokenValue);
        db.AuthRefreshTokens.Add(new AuthRefreshToken
        {
            SessionId = session.Id,
            TokenHash = refreshToken,
            ExpiresAtUtc = session.OriginalExpiresAtUtc
        });
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation("Authentication succeeded for user {UserId}", user.Id);
        return await CreateOperationResultAsync(user, session, refreshTokenValue, cancellationToken);
    }

    public async Task<AuthOperationResult?> RefreshAsync(
        string refreshToken,
        CancellationToken cancellationToken)
    {
        var tokenHash = HashRefreshToken(refreshToken);
        var token = await db.AuthRefreshTokens
            .SingleOrDefaultAsync(item => item.TokenHash == tokenHash, cancellationToken);
        if (token is null)
            return null;
        var session = await db.AuthSessions
            .SingleOrDefaultAsync(item => item.Id == token.SessionId, cancellationToken);
        if (session is null)
            return null;

        var now = DateTimeOffset.UtcNow;
        if (token.ConsumedAtUtc is not null)
        {
            session.RevokedAtUtc ??= now;
            await db.SaveChangesAsync(cancellationToken);
            logger.LogWarning("Refresh token reuse detected for session {SessionId}", session.Id);
            return null;
        }

        if (token.RevokedAtUtc is not null
            || session.RevokedAtUtc is not null
            || session.OriginalExpiresAtUtc <= now
            || token.ExpiresAtUtc <= now)
        {
            if (session.RevokedAtUtc is null)
            {
                session.RevokedAtUtc = now;
                await db.SaveChangesAsync(cancellationToken);
            }
            return null;
        }

        var user = await users.FindByIdAsync(session.UserId);
        if (user is not { IsActive: true })
        {
            session.RevokedAtUtc = now;
            await db.SaveChangesAsync(cancellationToken);
            return null;
        }

        var nextTokenHash = CreateRefreshTokenHash(out var nextRefreshToken);
        var replacement = new AuthRefreshToken
        {
            SessionId = session.Id,
            TokenHash = nextTokenHash,
            ExpiresAtUtc = session.OriginalExpiresAtUtc
        };

        var consumed = await db.AuthRefreshTokens
            .Where(item => item.Id == token.Id
                && item.ConsumedAtUtc == null
                && item.RevokedAtUtc == null)
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(item => item.ConsumedAtUtc, now)
                .SetProperty(item => item.ReplacedByTokenId, replacement.Id),
                cancellationToken);
        if (consumed == 0)
        {
            session.RevokedAtUtc ??= now;
            await db.SaveChangesAsync(cancellationToken);
            logger.LogWarning("Concurrent refresh token reuse detected for session {SessionId}", session.Id);
            return null;
        }

        db.AuthRefreshTokens.Add(replacement);
        await db.SaveChangesAsync(cancellationToken);

        return await CreateOperationResultAsync(user, session, nextRefreshToken, cancellationToken);
    }

    public async Task RevokeRefreshTokenAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
            return;

        var tokenHash = HashRefreshToken(refreshToken);
        var token = await db.AuthRefreshTokens
            .SingleOrDefaultAsync(item => item.TokenHash == tokenHash, cancellationToken);
        if (token is null)
            return;

        token.RevokedAtUtc = DateTimeOffset.UtcNow;
        var session = await db.AuthSessions.SingleAsync(item => item.Id == token.SessionId, cancellationToken);
        session.RevokedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task RevokeAllSessionsAsync(string userId, CancellationToken cancellationToken)
    {
        var sessions = await db.AuthSessions
            .Where(item => item.UserId == userId && item.RevokedAtUtc == null)
            .ToListAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        foreach (var session in sessions)
            session.RevokedAtUtc = now;

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task RevokeOtherSessionsAsync(
        string userId,
        string currentSessionId,
        CancellationToken cancellationToken)
    {
        var sessions = await db.AuthSessions
            .Where(item => item.UserId == userId
                && item.Id != currentSessionId
                && item.RevokedAtUtc == null)
            .ToListAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;
        foreach (var session in sessions)
            session.RevokedAtUtc = now;

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task<AuthUserResponse> GetUserResponseAsync(
        ApplicationUser user,
        CancellationToken cancellationToken)
    {
        var roles = (await users.GetRolesAsync(user)).ToArray();
        var permissions = new Dictionary<string, string>(StringComparer.Ordinal);

        if (roles.Contains("Admin", StringComparer.OrdinalIgnoreCase))
        {
            foreach (var component in AuthDataInitializer.ComponentIds)
                permissions[component] = "Full";
        }
        else
        {
            var roleIds = await db.UserRoles
                .Where(item => item.UserId == user.Id)
                .Select(item => item.RoleId)
                .ToListAsync(cancellationToken);

            var roleLevels = await db.RoleComponentPermissions
                .AsNoTracking()
                .Where(item => roleIds.Contains(item.RoleId))
                .ToListAsync(cancellationToken);

            foreach (var roleLevel in roleLevels)
            {
                if (!permissions.TryGetValue(roleLevel.PermissionId, out var current)
                    || string.Equals(roleLevel.Level, "Full", StringComparison.OrdinalIgnoreCase)
                    || (string.Equals(roleLevel.Level, "View", StringComparison.OrdinalIgnoreCase)
                        && string.Equals(current, "None", StringComparison.OrdinalIgnoreCase)))
                {
                    permissions[roleLevel.PermissionId] = roleLevel.Level;
                }
            }

            var overrides = await db.UserComponentPermissions
                .AsNoTracking()
                .Where(item => item.UserId == user.Id)
                .ToListAsync(cancellationToken);
            foreach (var permission in overrides)
                permissions[permission.PermissionId] = permission.Level;
        }

        return new AuthUserResponse(
            user.Id,
            user.UserName ?? string.Empty,
            user.DisplayName,
            roles,
            permissions);
    }

    private async Task<AuthOperationResult> CreateOperationResultAsync(
        ApplicationUser user,
        AuthSession session,
        string refreshToken,
        CancellationToken cancellationToken)
    {
        var roles = (await users.GetRolesAsync(user)).ToArray();
        var accessToken = tokenService.CreateAccessToken(
            user,
            roles,
            session.Id,
            session.OriginalExpiresAtUtc);

        return new AuthOperationResult(
            accessToken.Token,
            accessToken.ExpiresAtUtc,
            await GetUserResponseAsync(user, cancellationToken),
            refreshToken,
            session.OriginalExpiresAtUtc);
    }

    private static string CreateRefreshTokenHash(out string refreshToken)
    {
        refreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
        return HashRefreshToken(refreshToken);
    }

    private static string HashRefreshToken(string token) =>
        Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
