using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using System.Text;

namespace ADApi.Helpers;

public static class DocxHelper
{
    public static byte[] FillTemplate(string templatePath, Dictionary<string, string> placeholders)
    {
        // Copy template to memory stream
        using var templateStream = File.OpenRead(templatePath);
        using var memoryStream = new MemoryStream();
        templateStream.CopyTo(memoryStream);
        memoryStream.Position = 0;

        // Open and modify the document
        using (var wordDocument = WordprocessingDocument.Open(memoryStream, true))
        {
            var body = wordDocument.MainDocumentPart?.Document.Body;
            if (body == null)
                throw new InvalidOperationException("Document body is null");

            // Process all paragraphs (including those in tables)
            foreach (var paragraph in body.Descendants<Paragraph>())
            {
                // Get all text from the paragraph
                var fullText = string.Join("", paragraph.Descendants<Text>().Select(t => t.Text));
                
                // Check if any placeholder exists in this paragraph
                foreach (var placeholder in placeholders)
                {
                    if (fullText.Contains(placeholder.Key))
                    {
                        // Replace the placeholder
                        var updatedText = fullText.Replace(placeholder.Key, placeholder.Value);
                        
                        // Clear all existing text elements
                        var textElements = paragraph.Descendants<Text>().ToList();
                        if (textElements.Any())
                        {
                            // Set the first text element to the full updated text
                            textElements[0].Text = updatedText;
                            
                            // Remove all other text elements
                            for (int i = 1; i < textElements.Count; i++)
                            {
                                textElements[i].Text = "";
                            }
                        }
                        
                        // Update fullText for next placeholder
                        fullText = updatedText;
                    }
                }
            }

            wordDocument.MainDocumentPart.Document.Save();
        }

        return memoryStream.ToArray();
    }

    public static string ConvertToHtml(byte[] docxBytes)
    {
        using var docxStream = new MemoryStream(docxBytes);
        using var wordDoc = WordprocessingDocument.Open(docxStream, false);
        
        var body = wordDoc.MainDocumentPart?.Document.Body;
        if (body == null) return "<html><body>Error: Document body not found</body></html>";

        var html = new StringBuilder();
        html.AppendLine("<!DOCTYPE html>");
        html.AppendLine("<html>");
        html.AppendLine("<head>");
        html.AppendLine("<meta charset='utf-8'>");
        html.AppendLine("<style>");
        html.AppendLine("body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }");
        html.AppendLine("p { margin: 10px 0; }");
        html.AppendLine("table { border-collapse: collapse; width: 100%; margin: 20px 0; }");
        html.AppendLine("td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }");
        html.AppendLine("@media print { body { margin: 20px; } }");
        html.AppendLine("</style>");
        html.AppendLine("</head>");
        html.AppendLine("<body>");

        foreach (var paragraph in body.Descendants<Paragraph>())
        {
            var text = paragraph.InnerText;
            if (!string.IsNullOrWhiteSpace(text))
            {
                html.AppendLine($"<p>{System.Net.WebUtility.HtmlEncode(text)}</p>");
            }
        }

        foreach (var table in body.Descendants<Table>())
        {
            html.AppendLine("<table>");
            foreach (var row in table.Descendants<TableRow>())
            {
                html.AppendLine("<tr>");
                foreach (var cell in row.Descendants<TableCell>())
                {
                    var cellText = cell.InnerText;
                    html.AppendLine($"<td>{System.Net.WebUtility.HtmlEncode(cellText)}</td>");
                }
                html.AppendLine("</tr>");
            }
            html.AppendLine("</table>");
        }

        html.AppendLine("</body>");
        html.AppendLine("</html>");

        return html.ToString();
    }
}
