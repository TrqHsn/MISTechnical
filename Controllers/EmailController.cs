using Microsoft.AspNetCore.Mvc;
using System.Text;
using ClosedXML.Excel;
using System.IO;
using System.IO;
using System.Net;
using System.Reflection;

namespace ADApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class EmailController : ControllerBase
    {
        [HttpPost("generate")]
        public IActionResult GenerateEmail([FromBody] FormDataModel model)
        {
            try
            {
                // Generate the Excel file based on form data
                var excelBytes = GenerateExcel(model);

                // Generate the .eml content
                var emlContent = GenerateEml(model, excelBytes);

                // Return the .eml file
                return File(Encoding.UTF8.GetBytes(emlContent), "message/rfc822", "email.eml");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "Failed to generate email", message = ex.Message });
            }
        }

        private byte[] GenerateExcel(FormDataModel model)
        {
            // Path to the template from the runtime output path
            var templatePath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "MIS", "public", "templateNRBR2.xlsx");
            templatePath = Path.GetFullPath(templatePath);

            if (!System.IO.File.Exists(templatePath))
            {
                throw new FileNotFoundException("Template file not found", templatePath);
            }

            using var workbook = new XLWorkbook(templatePath);
            var worksheet = workbook.Worksheet(1); // Assuming first worksheet

            if (worksheet == null)
            {
                throw new Exception("Invalid Excel template: no worksheets found");
            }

            // Fill in the cells same as frontend
            worksheet.Cell("B5").Value = model.Site ?? "";
            worksheet.Cell("B7").Value = GetActionTypeLabel(model.ActionType ?? "");
            worksheet.Cell("B9").Value = model.NewComputerName ?? "";
            worksheet.Cell("B11").Value = model.Username ?? "";
            worksheet.Cell("B13").Value = model.Description ?? "";
            worksheet.Cell("E5").Value = model.Company ?? "";
            worksheet.Cell("E7").Value = model.OldComputerName ?? "";
            worksheet.Cell("E9").Value = model.OperatingSystem ?? "";
            worksheet.Cell("E11").Value = model.RaisedBy ?? "";
            worksheet.Cell("E13").Value = FormatDate(model.RaisedDate ?? "");

            using var stream = new MemoryStream();
            workbook.SaveAs(stream);
            return stream.ToArray();
        }

        private string FormatDate(string dateStr)
        {
            if (string.IsNullOrEmpty(dateStr)) return "";
            if (DateTime.TryParse(dateStr, out var date))
            {
                return date.ToString("MM/dd/yyyy");
            }
            return dateStr;
        }

        private string GenerateEml(FormDataModel model, byte[] attachmentBytes)
        {
            // Generate the filename like the frontend does
            var actionTypeLabel = GetActionTypeLabel(model.ActionType ?? "");
            var computerName = model.NewComputerName ?? model.OldComputerName ?? "";
            var filename = $"IT Computer Form IT003 v3.0_{actionTypeLabel}_{computerName}";

            // Dynamic subject: subject will be file name
            var subject = filename;

            var safeFilename = WebUtility.HtmlEncode(filename);
            var body = $@"<div style=""font-family: Aptos, Calibri, Arial, sans-serif;"">
<div>Dear Team,</div>
<div><br></div>
<div>Please process ""{safeFilename}""</div>
<div><br></div>
<div><b>With regards</b></div>
<div><a href=""https://teams.microsoft.com/l/chat/0/0?users=Tareque.Hasan%40dewhirst.com""><img src=""cid:teams-signature-icon"" width=""19"" height=""20"" alt=""Microsoft Teams"" style=""vertical-align: middle;""></a> <b><a href=""https://teams.microsoft.com/l/chat/0/0?users=Tareque.Hasan%40dewhirst.com"">Tareque Hasan</a></b> | <b>Executive, MIS</b></div>
<div>🏢 Shanta Industries Limited | Plot No 198 &amp; 201/220 &amp; 223/156 &amp; 177 | DEPZ Extension Area | Ganakbari, Savar | Dhaka | Bangladesh.</div>
<div>🌐 <a href=""http://www.dewhirst.com/"">www.dewhirst.com</a> &nbsp;| 📧 <a href=""mailto:tareque.hasan@dewhirst.com"">tareque.hasan@dewhirst.com</a></div>
</div>";

            using var iconResource = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("ADApi.Assets.TeamsSignatureIcon.png")
                ?? throw new FileNotFoundException("Embedded Teams signature icon resource is missing.");
            using var iconStream = new MemoryStream();
            iconResource.CopyTo(iconStream);
            var signatureIcon = iconStream.ToArray();

            var mixedBoundary = "----=_NextPart_" + Guid.NewGuid().ToString("N");
            var relatedBoundary = "----=_Related_" + Guid.NewGuid().ToString("N");

            var eml = new StringBuilder();
            eml.AppendLine("From: tareque.hasan@dewhirst.com");
            eml.AppendLine("To: support@dewhirst.com");
            eml.AppendLine("CC: Bangladesh.IT@dewhirst.com");
            eml.AppendLine($"Subject: {subject}");
            eml.AppendLine("X-Unsent: 1");
            eml.AppendLine("MIME-Version: 1.0");
            eml.AppendLine($"Content-Type: multipart/mixed; boundary=\"{mixedBoundary}\"");
            eml.AppendLine();
            eml.AppendLine($"--{mixedBoundary}");
            eml.AppendLine($"Content-Type: multipart/related; boundary=\"{relatedBoundary}\"; type=\"text/html\"");
            eml.AppendLine();
            eml.AppendLine($"--{relatedBoundary}");
            eml.AppendLine("Content-Type: text/html; charset=utf-8");
            eml.AppendLine("Content-Transfer-Encoding: base64");
            eml.AppendLine();
            AppendBase64Lines(eml, Encoding.UTF8.GetBytes(body));
            eml.AppendLine();
            eml.AppendLine($"--{relatedBoundary}");
            eml.AppendLine("Content-Type: image/png; name=\"teams-icon.png\"");
            eml.AppendLine("Content-Transfer-Encoding: base64");
            eml.AppendLine("Content-ID: <teams-signature-icon>");
            eml.AppendLine("Content-Disposition: inline; filename=\"teams-icon.png\"");
            eml.AppendLine();
            AppendBase64Lines(eml, signatureIcon);
            eml.AppendLine();
            eml.AppendLine($"--{relatedBoundary}--");
            eml.AppendLine();
            eml.AppendLine($"--{mixedBoundary}");
            eml.AppendLine("Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            eml.AppendLine("Content-Transfer-Encoding: base64");
            eml.AppendLine($"Content-Disposition: attachment; filename=\"{filename}.xlsx\"");
            eml.AppendLine();
            AppendBase64Lines(eml, attachmentBytes);
            eml.AppendLine();
            eml.AppendLine($"--{mixedBoundary}--");

            return eml.ToString();
        }

        private static void AppendBase64Lines(StringBuilder builder, byte[] bytes)
        {
            var base64 = Convert.ToBase64String(bytes);
            for (var offset = 0; offset < base64.Length; offset += 76)
            {
                builder.AppendLine(base64.Substring(offset, Math.Min(76, base64.Length - offset)));
            }
        }

        private string GetActionTypeLabel(string actionType)
        {
            return actionType switch
            {
                "N" => "New",
                "R" => "Removal",
                "RB" => "Rebuild",
                _ => "Unknown"
            };
        }
    }

    public class FormDataModel
    {
        public string? ActionType { get; set; }
        public string? OldComputerName { get; set; }
        public string? NewComputerName { get; set; }
        public string? Description { get; set; }
        public string? Username { get; set; }
        public string? DeviceType { get; set; }
        public string? OperatingSystem { get; set; }
        public string? RaisedBy { get; set; }
        public string? RaisedDate { get; set; }
        public string? Site { get; set; }
        public string? Company { get; set; }
    }
}