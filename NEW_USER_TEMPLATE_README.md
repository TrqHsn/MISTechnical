# New User Assignment Form - Template Setup

## 1. Install Required NuGet Packages

Run in the project directory:
```bash
dotnet restore
```

This will install:
- DocumentFormat.OpenXml (for DOCX manipulation)
- Syncfusion.DocIO.Net.Core (for DOCX reading)
- Syncfusion.DocIORenderer.Net.Core (for PDF conversion)

## 2. Get Syncfusion Community License (FREE)

Syncfusion is **FREE** for:
- Companies with less than $1 million USD in annual gross revenue
- Individual developers
- Open source projects

**Steps to get your FREE license:**
1. Go to: https://www.syncfusion.com/sales/communitylicense
2. Sign up for a free account
3. Claim your community license key
4. Copy the license key
5. Update `Program.cs` and replace `YOUR_LICENSE_KEY_HERE` with your actual license key

## 3. Template File Location

Place the `NewUserAssign.docx` template file in:
```
c:\ad PROJECT\MIS\public\NewUserAssign.docx
```

## Template Placeholders

The DOCX template should contain these exact placeholders:

- `{{firstName}}` - Will be replaced with the user's first name
- `{{lastName}}` - Will be replaced with the user's last name
- `{{section}}` - Will be replaced with the section name
- `{{department}}` - Will be replaced with the department name

## Important Notes

1. **Placeholder Format**: Use double curly braces `{{placeholder}}`
2. **Keep placeholders intact**: Do not split placeholders across Word formatting runs
3. **Plain text**: Ensure placeholders are plain text, not styled separately
4. **Case sensitive**: Use exact case as shown above

## Example Template Content

```
New User Assignment Form

Employee Information:
First Name: {{firstName}}
Last Name: {{lastName}}

Department Details:
Section: {{section}}
Department: {{department}}

[Rest of your form content here...]
```

## Testing the Template

1. Create a Word document with the placeholders
2. Save as `NewUserAssign.docx`
3. Place in `MIS/public/` folder
4. Run the application and test with the New User form

## Troubleshooting

If placeholders are not being replaced:
- Open the DOCX in Word
- Select the placeholder text
- Press Ctrl+Space to clear formatting
- Retype the placeholder exactly as shown above
- Save and test again
