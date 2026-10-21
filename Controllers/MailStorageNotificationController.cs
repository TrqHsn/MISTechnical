using System.Net.Mail;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Reflection;
using ADApi.Models;
using ADApi.Services;
using Ganss.Xss;
using Microsoft.AspNetCore.Mvc;

namespace ADApi.Controllers;

[ApiController]
[Route("api/mail-storage-notification")]
public sealed class MailStorageNotificationController : ControllerBase
{
    private const string MandatoryCc = "ridoan.zahan@dewhirst.com";
    private readonly IActiveDirectoryService _activeDirectoryService;
    private readonly ILogger<MailStorageNotificationController> _logger;

    public MailStorageNotificationController(
        IActiveDirectoryService activeDirectoryService,
        ILogger<MailStorageNotificationController> logger)
    {
        _activeDirectoryService = activeDirectoryService;
        _logger = logger;
    }

    /// <summary>Creates one Outlook-compatible, unsent mail-storage notification EML file.</summary>
    [HttpPost("generate")]
    [Produces("message/rfc822")]
    [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Generate(
        [FromBody] GenerateMailStorageNotificationRequest request,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        UserDto? user;
        try
        {
            user = await _activeDirectoryService.GetUserBySamAccountNameAsync(request.SamAccountName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AD lookup failed for mail-storage notification recipient {SamAccountName}", request.SamAccountName);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new
            {
                error = "Active Directory is unavailable",
                message = "The selected user's directory details could not be verified. Try again later."
            });
        }

        if (user is null)
            return NotFound(new { error = "User not found", message = "The selected user could not be found in Active Directory." });

        if (user.Enabled != true)
            return BadRequest(new
            {
                error = user.Enabled == false ? "Account disabled" : "Account status unavailable",
                message = user.Enabled == false
                    ? "The selected Active Directory account is disabled. An EML draft cannot be generated."
                    : "The selected user's account status could not be verified. An EML draft cannot be generated."
            });

        if (string.IsNullOrWhiteSpace(user.SamAccountName) ||
            !Regex.IsMatch(user.SamAccountName, @"^[A-Za-z0-9._-]{1,20}$"))
            return BadRequest(new { error = "Invalid account name", message = "The selected user's account name cannot be used for a safe EML filename." });

        if (!TryGetAddress(user.Email, out var toAddress))
            return BadRequest(new { error = "Recipient email unavailable", message = "The selected user does not have a valid email address in Active Directory." });

        var subject = request.Category switch
        {
            "Archive Mail" => "Archive mailbox nearly full",
            "Mailbox" => "Mailbox storage nearly full",
            _ => null
        };

        if (subject is null)
            return BadRequest(new { error = "Invalid category", message = "Select Archive Mail or Mailbox." });

        var ccAddresses = new List<string> { MandatoryCc };
        if (request.IncludeManagerInCc)
        {
            if (!TryGetAddress(user.ManagerEmail, out var managerAddress))
                return BadRequest(new
                {
                    error = "Manager email unavailable",
                    message = "The user's manager does not have a valid email address in Active Directory. Disable 'Include manager in CC' to continue."
                });

            if (!ccAddresses.Contains(managerAddress, StringComparer.OrdinalIgnoreCase))
                ccAddresses.Add(managerAddress);
        }

        var sanitizer = CreateHtmlSanitizer();
        var sanitizedBody = sanitizer.Sanitize(request.HtmlBody);
        var bodyText = WebUtility.HtmlDecode(Regex.Replace(sanitizedBody, "<[^>]*>", string.Empty));
        if (string.IsNullOrWhiteSpace(bodyText))
            return BadRequest(new { error = "Email body required", message = "Enter some email body text before generating the draft." });
        sanitizedBody = $"<div style=\"font-family: Aptos, Calibri, Arial, sans-serif;\">{sanitizedBody}</div>";

        byte[]? signatureIcon = null;
        if (sanitizedBody.Contains("src=\"/signature/teams-icon.png\"", StringComparison.OrdinalIgnoreCase))
        {
            using var resource = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("ADApi.Assets.TeamsSignatureIcon.png");
            if (resource is null)
            {
                _logger.LogError("Embedded Teams signature icon resource is missing");
                return StatusCode(StatusCodes.Status500InternalServerError, new
                {
                    error = "Signature asset unavailable",
                    message = "The signature icon could not be loaded to build the EML."
                });
            }

            using var iconStream = new MemoryStream();
            await resource.CopyToAsync(iconStream, cancellationToken);
            signatureIcon = iconStream.ToArray();
            sanitizedBody = sanitizedBody.Replace(
                "src=\"/signature/teams-icon.png\"",
                "src=\"cid:teams-signature-icon\"",
                StringComparison.OrdinalIgnoreCase);
        }

        var eml = BuildEml(toAddress, ccAddresses, subject, sanitizedBody, signatureIcon);
        var currentMonth = DateTime.Now.ToString("yyyy-MM");
        var filename = $"{user.SamAccountName}_MailboxCleanup_{currentMonth}.eml";
        return File(Encoding.UTF8.GetBytes(eml), "message/rfc822", filename);
    }

    private static HtmlSanitizer CreateHtmlSanitizer()
    {
        var sanitizer = new HtmlSanitizer();
        sanitizer.AllowedTags.Add("font");
        sanitizer.AllowedTags.Add("img");
        sanitizer.AllowedAttributes.Add("face");
        sanitizer.AllowedAttributes.Add("size");
        sanitizer.AllowedAttributes.Add("style");
        sanitizer.AllowedAttributes.Add("align");
        sanitizer.AllowedAttributes.Add("width");
        sanitizer.AllowedAttributes.Add("height");
        sanitizer.AllowedAttributes.Add("src");
        sanitizer.AllowedAttributes.Add("alt");
        sanitizer.AllowedCssProperties.Add("font-family");
        sanitizer.AllowedCssProperties.Add("font-size");
        sanitizer.AllowedCssProperties.Add("font-weight");
        sanitizer.AllowedCssProperties.Add("font-style");
        sanitizer.AllowedCssProperties.Add("text-decoration");
        sanitizer.AllowedCssProperties.Add("text-align");
        sanitizer.AllowedCssProperties.Add("color");
        sanitizer.AllowedCssProperties.Add("background-color");
        sanitizer.AllowedCssProperties.Add("padding");
        sanitizer.AllowedCssProperties.Add("padding-top");
        sanitizer.AllowedCssProperties.Add("padding-bottom");
        sanitizer.AllowedCssProperties.Add("padding-left");
        sanitizer.AllowedCssProperties.Add("padding-right");
        sanitizer.AllowedCssProperties.Add("border-collapse");
        sanitizer.AllowedCssProperties.Add("width");
        sanitizer.AllowedCssProperties.Add("vertical-align");
        return sanitizer;
    }

    private static bool TryGetAddress(string? value, out string address)
    {
        address = string.Empty;
        if (string.IsNullOrWhiteSpace(value) || value.Contains('\r') || value.Contains('\n'))
            return false;

        try
        {
            address = new MailAddress(value.Trim()).Address;
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static string BuildEml(
        string toAddress,
        IReadOnlyList<string> ccAddresses,
        string subject,
        string htmlBody,
        byte[]? signatureIcon)
    {
        var encodedSubject = Convert.ToBase64String(Encoding.UTF8.GetBytes(subject));
        var encodedBody = Convert.ToBase64String(Encoding.UTF8.GetBytes(htmlBody));
        var boundary = $"----=_MailStorage_{Guid.NewGuid():N}";
        var lines = new List<string>
        {
            $"To: {toAddress}",
            $"Cc: {string.Join(", ", ccAddresses)}",
            $"Subject: =?UTF-8?B?{encodedSubject}?=",
            "X-Unsent: 1",
            "MIME-Version: 1.0"
        };

        if (signatureIcon is null)
        {
            lines.Add("Content-Type: text/html; charset=utf-8");
            lines.Add("Content-Transfer-Encoding: base64");
            lines.Add(string.Empty);
            AddBase64Lines(lines, encodedBody);
            return string.Join("\r\n", lines) + "\r\n";
        }

        lines.Add($"Content-Type: multipart/related; boundary=\"{boundary}\"; type=\"text/html\"");
        lines.Add(string.Empty);
        lines.Add($"--{boundary}");
        lines.Add("Content-Type: text/html; charset=utf-8");
        lines.Add("Content-Transfer-Encoding: base64");
        lines.Add(string.Empty);
        AddBase64Lines(lines, encodedBody);

        var encodedIcon = Convert.ToBase64String(signatureIcon);
        lines.AddRange(new[]
        {
            string.Empty,
            $"--{boundary}",
            "Content-Type: image/png; name=\"teams-icon.png\"",
            "Content-Transfer-Encoding: base64",
            "Content-ID: <teams-signature-icon>",
            "Content-Disposition: inline; filename=\"teams-icon.png\"",
            string.Empty
        });
        AddBase64Lines(lines, encodedIcon);
        lines.Add(string.Empty);
        lines.Add($"--{boundary}--");

        return string.Join("\r\n", lines) + "\r\n";
    }

    private static void AddBase64Lines(List<string> lines, string base64)
    {
        lines.AddRange(Enumerable.Range(0, (base64.Length + 75) / 76)
            .Select(index => base64.Substring(index * 76, Math.Min(76, base64.Length - index * 76))));
    }
}
