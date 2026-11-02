using System.Security.Claims;
using System.Security.Cryptography;
using ADApi.Models.Security;
using ADApi.Models.Security.Contracts;
using ADApi.Services.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ADApi.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    IAuthSessionService sessions,
    UserManager<ApplicationUser> users,
    IWebHostEnvironment environment) : ControllerBase
{
    private const string RefreshCookieName = "ADApi.Refresh";
    private const string CsrfCookieName = "ADApi.Csrf";
    private const string CsrfHeaderName = "X-CSRF-Token";

    /// <summary>Authenticates credentials and creates a 24-hour maximum session.</summary>
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("login")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthResponse>> Login(
        [FromBody] LoginRequest request,
        CancellationToken cancellationToken)
    {
        var result = await sessions.LoginAsync(
            request.Username.Trim(),
            request.Password,
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            cancellationToken);
        if (result is null)
            return Unauthorized(new ProblemDetails { Title = "Invalid username or password." });

        SetSessionCookies(result.RefreshToken, result.SessionExpiresAtUtc);
        return Ok(ToResponse(result));
    }

    /// <summary>Rotates the refresh token and issues a new access token.</summary>
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [HttpPost("refresh")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthResponse>> Refresh(CancellationToken cancellationToken)
    {
        if (!HasValidCsrfToken())
            return BadRequest(new ProblemDetails { Title = "Invalid anti-forgery token." });

        var refreshToken = Request.Cookies[RefreshCookieName];
        if (string.IsNullOrEmpty(refreshToken))
        {
            ClearSessionCookies();
            return Unauthorized();
        }

        var result = await sessions.RefreshAsync(refreshToken, cancellationToken);
        if (result is null)
        {
            ClearSessionCookies();
            return Unauthorized();
        }

        SetSessionCookies(result.RefreshToken, result.SessionExpiresAtUtc);
        return Ok(ToResponse(result));
    }

    /// <summary>Revokes the current refresh session and clears its cookies.</summary>
    [AllowAnonymous]
    [HttpPost("logout")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        if (!HasValidCsrfToken())
            return BadRequest(new ProblemDetails { Title = "Invalid anti-forgery token." });

        await sessions.RevokeRefreshTokenAsync(
            Request.Cookies[RefreshCookieName],
            cancellationToken);
        ClearSessionCookies();
        return NoContent();
    }

    /// <summary>Returns the current user's roles and effective component permissions.</summary>
    [Authorize]
    [HttpGet("me")]
    [ProducesResponseType<CurrentUserResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<CurrentUserResponse>> Me(CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var user = userId is null ? null : await users.FindByIdAsync(userId);
        if (user is not { IsActive: true })
            return Unauthorized();

        var response = await sessions.GetUserResponseAsync(user, cancellationToken);
        return Ok(new CurrentUserResponse(
            response.UserId,
            response.Username,
            response.DisplayName,
            response.Roles,
            response.Permissions));
    }

    /// <summary>Changes the signed-in user's password and revokes all active sessions.</summary>
    [Authorize]
    [HttpPost("change-password")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        var user = userId is null ? null : await users.FindByIdAsync(userId);
        if (user is null)
            return Unauthorized();

        var result = await users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            return BadRequest(new ProblemDetails
            {
                Title = "Password change was rejected.",
                Detail = string.Join(", ", result.Errors.Select(error => error.Code))
            });
        }

        await sessions.RevokeAllSessionsAsync(user.Id, cancellationToken);
        return NoContent();
    }

    private static AuthResponse ToResponse(AuthOperationResult result) =>
        new(result.AccessToken, result.ExpiresAtUtc, result.SessionExpiresAtUtc, result.User);

    private void SetSessionCookies(string refreshToken, DateTimeOffset expiresAtUtc)
    {
        var secure = !environment.IsDevelopment();
        var cookieOptions = new CookieOptions
        {
            HttpOnly = true,
            Secure = secure,
            SameSite = SameSiteMode.Strict,
            IsEssential = true,
            Path = "/api/auth",
            Expires = expiresAtUtc
        };
        Response.Cookies.Append(RefreshCookieName, refreshToken, cookieOptions);

        Response.Cookies.Append(CsrfCookieName, Convert.ToHexString(RandomNumberGenerator.GetBytes(32)), new CookieOptions
        {
            HttpOnly = false,
            Secure = secure,
            SameSite = SameSiteMode.Strict,
            IsEssential = true,
            Path = "/",
            Expires = expiresAtUtc
        });
    }

    private bool HasValidCsrfToken()
    {
        var cookieToken = Request.Cookies[CsrfCookieName];
        var headerToken = Request.Headers[CsrfHeaderName].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(cookieToken) || string.IsNullOrWhiteSpace(headerToken))
            return false;

        var cookieBytes = System.Text.Encoding.UTF8.GetBytes(cookieToken);
        var headerBytes = System.Text.Encoding.UTF8.GetBytes(headerToken);
        return cookieBytes.Length == headerBytes.Length
            && CryptographicOperations.FixedTimeEquals(cookieBytes, headerBytes);
    }

    private void ClearSessionCookies()
    {
        var options = new CookieOptions
        {
            HttpOnly = true,
            Secure = !environment.IsDevelopment(),
            SameSite = SameSiteMode.Strict,
            Path = "/api/auth"
        };
        Response.Cookies.Delete(RefreshCookieName, options);
        Response.Cookies.Delete(CsrfCookieName, new CookieOptions
        {
            Secure = !environment.IsDevelopment(),
            SameSite = SameSiteMode.Strict,
            Path = "/"
        });
    }
}
