using System.ComponentModel.DataAnnotations;

namespace ADApi.Models.Security.Contracts;

/// <summary>Credentials used to create an authenticated application session.</summary>
public sealed record LoginRequest
{
    [Required, StringLength(256, MinimumLength = 1)]
    public required string Username { get; init; }

    [Required, StringLength(256, MinimumLength = 1)]
    public required string Password { get; init; }
}

/// <summary>Contains an access token and non-secret account information.</summary>
public sealed record AuthUserResponse(
    string UserId,
    string Username,
    string DisplayName,
    IReadOnlyList<string> Roles,
    IReadOnlyDictionary<string, string> Permissions);

/// <summary>Represents a successful sign-in or token refresh.</summary>
public sealed record AuthOperationResult(
    string AccessToken,
    DateTimeOffset ExpiresAtUtc,
    AuthUserResponse User,
    string RefreshToken,
    DateTimeOffset SessionExpiresAtUtc);

/// <summary>Authentication response containing an access token but no refresh token.</summary>
public sealed record AuthResponse(
    string AccessToken,
    DateTimeOffset ExpiresAtUtc,
    DateTimeOffset SessionExpiresAtUtc,
    AuthUserResponse User);

/// <summary>Payload for changing the signed-in user's password.</summary>
public sealed record ChangePasswordRequest
{
    [Required]
    public required string CurrentPassword { get; init; }

    [Required, StringLength(128, MinimumLength = 8)]
    public required string NewPassword { get; init; }
}

/// <summary>Public information about the signed-in account and its current access.</summary>
public sealed record CurrentUserResponse(
    string UserId,
    string Username,
    string DisplayName,
    IReadOnlyList<string> Roles,
    IReadOnlyDictionary<string, string> Permissions);
