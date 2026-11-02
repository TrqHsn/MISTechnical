using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ADApi.Models.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ADApi.Services.Security;

public sealed class AuthTokenService(IOptions<AuthOptions> options)
{
    private readonly AuthOptions _options = options.Value;

    public (string Token, DateTimeOffset ExpiresAtUtc) CreateAccessToken(
        ApplicationUser user,
        IReadOnlyCollection<string> roles,
        string sessionId,
        DateTimeOffset sessionExpiresAtUtc)
    {
        var now = DateTimeOffset.UtcNow;
        var expiresAt = now.AddMinutes(_options.AccessTokenMinutes);
        if (expiresAt > sessionExpiresAtUtc)
            expiresAt = sessionExpiresAtUtc;

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id),
            new(JwtRegisteredClaimNames.UniqueName, user.UserName ?? string.Empty),
            new("sid", sessionId)
        };
        claims.AddRange(roles.Select(role => new Claim("role", role)));

        var signingKey = new SymmetricSecurityKey(_options.GetSigningKey());
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}
