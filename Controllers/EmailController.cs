using Microsoft.AspNetCore.Mvc;
using System.Text;
using ClosedXML.Excel;
using System.IO;
using System.IO;

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
            var templatePath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "MIS", "public", "templateNRBR.xlsx");
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
            worksheet.Cell("E5").Value = model.Company ?? "";
            worksheet.Cell("B7").Value = GetActionTypeLabel(model.ActionType ?? "");
            worksheet.Cell("E7").Value = model.OldComputerName ?? "";
            worksheet.Cell("B9").Value = model.NewComputerName ?? "";
            worksheet.Cell("E9").Value = model.DeviceType ?? "";
            worksheet.Cell("B11").Value = model.Username ?? "";
            worksheet.Cell("E11").Value = model.OperatingSystem ?? "";
            worksheet.Cell("B13").Value = model.Description ?? "";
            worksheet.Cell("E13").Value = model.AdGroup ?? "";
            worksheet.Cell("B15").Value = model.RaisedBy ?? "";
            worksheet.Cell("E15").Value = FormatDate(model.RaisedDate ?? "");

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
            var filename = $"IT Computer Form IT003 v2.0_{actionTypeLabel}_{computerName}";

            // Dynamic subject: subject will be file name
            var subject = filename;

            // Simple dynamic body with HTML formatting
            var body = $@"Dear Team,<br><br>
Please process ""{filename}""<br><br>
<body style=""font-family: Calibri, sans-serif;"">  <table width=""400"" style=""border-collapse: collapse;"">      <!-- Header -->   <tr>     <td style=""padding: 5px 0 10px 0;"">       <span style=""font-size: 28px; color: #C00000;"">ᝰ✍🏻</span>       <b style=""color: #C00000; font-size: 13px;"">Regards,</b>       <br>       <b style=""font-family: 'Courier New'; font-size: 24px; color: #007177;"">         Tareque Hasan       </b>     </td>   </tr>    <!-- Role + Chat -->   <tr>     <td style=""background: #EAEAEA; padding: 5px;"">       <table width=""100%"" style=""border-collapse: collapse;"">         <tr>           <td style=""font-family: 'Courier New'; font-size: 18px; color: #444;"">             <b>Executive || MIS</b>           </td>           <td align=""right"">             <a href=""https://teams.microsoft.com/l/chat/0/0?users=tareque.hasan@dewhirst.com""                style=""text-decoration:none; font-family: 'Courier New'; font-size: 14px; color:#444;"">                💬 | Chat             </a>           </td>         </tr>       </table>     </td>   </tr>    <!-- Contact -->   <tr>     <td style=""padding-top: 10px; font-size: 12px; font-family: 'Courier New'; color: #828282;"">       email:        <a href=""mailto:tareque.hasan@dewhirst.com"" style=""color:#467886;"">         tareque.hasan@dewhirst.com       </a>       <br>       Shanta Denims Limited, Savar, Dhaka 1349, Bangladesh     </td>   </tr>  </table>  </body>";

            // Encode attachment in Base64
            var attachmentBase64 = Convert.ToBase64String(attachmentBytes);

            // MIME multipart/mixed
            var boundary = "----=_NextPart_" + Guid.NewGuid().ToString();

            var eml = new StringBuilder();
            eml.AppendLine("From: tareque.hasan@dewhirst.com");
            eml.AppendLine("To: support@dewhirst.com");
            eml.AppendLine("CC: Bangladesh.IT@dewhirst.com");
            eml.AppendLine($"Subject: {subject}");
            eml.AppendLine("X-Unsent: 1");
            eml.AppendLine("MIME-Version: 1.0");
            eml.AppendLine($"Content-Type: multipart/mixed; boundary=\"{boundary}\"");
            eml.AppendLine();
            eml.AppendLine($"--{boundary}");
            eml.AppendLine("Content-Type: text/html; charset=utf-8");
            eml.AppendLine("Content-Transfer-Encoding: 7bit");
            eml.AppendLine();
            eml.AppendLine(body);
            eml.AppendLine();
            eml.AppendLine($"--{boundary}");
            eml.AppendLine("Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            eml.AppendLine("Content-Transfer-Encoding: base64");
            eml.AppendLine($"Content-Disposition: attachment; filename=\"{filename}.xlsx\"");
            eml.AppendLine();
            eml.AppendLine(attachmentBase64);
            eml.AppendLine();
            eml.AppendLine($"--{boundary}--");

            return eml.ToString();
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
        public string? AdGroup { get; set; }
        public string? RaisedBy { get; set; }
        public string? RaisedDate { get; set; }
        public string? Site { get; set; }
        public string? Company { get; set; }
    }
}