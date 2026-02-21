# SMB Browser Feature

## Overview

The **SMB Browser** feature enables browsing and downloading files from Windows network shares (UNC paths) through a web interface. All filesystem operations happen securely in the .NET backend—Angular never touches SMB directly.

---

## How to Use

### 1. Access the Feature

Click the **Files** button in the main navigation bar (top of the page) or navigate directly to:
```
http://localhost:4200/files
```

### 2. Browse a Network Path

1. Enter a UNC path in the address bar:
   - `\\sdlfp7`
   - `\\server\share\folder\subfolder`
2. Click **Go** or press **Enter** to browse.

### 3. Navigate Folders

- **Click folder names** to open subfolders.
- **Breadcrumbs** at the top show your current location—click any segment to jump back to that level.
- **Back button** returns to the previous folder.

### 4. View Modes

Toggle between:
- **List View** (default): Tabular display with Name, Type, Size, Date Modified, Actions
- **Grid View**: Card-based layout with icons and metadata

View preference is saved in local storage.

### 5. Download Actions

**Single File:**
- Click **Download** next to any file.

**Entire Folder:**
- Click **Download Folder** for any folder row.
- Or use the **Download Folder** button at the top to download the current folder.
- Backend dynamically generates a ZIP archive streamed directly to your browser—supports folders up to **10 GB**.

---

## Features

### Address Bar
- UNC path input with **Go** button
- Supports any Windows network path: `\\server\share`
- Remembers last browsed path (stored in local storage)

### Navigation
- Clickable breadcrumbs
- Browser back/forward support (uses Angular router)
- Last browsed path and view mode are restored on reload

### Display Features
- **Folder/File Icons** (`📁` / `📄`)
- **Hidden** and **System** file tags
- **File sizes** with human-readable formatting (B, KB, MB, GB, TB)
- **Date Modified** in `yyyy-MM-dd HH:mm` format
- Empty folder message when no items exist

### Error Handling
- Invalid path: "Invalid path. Enter a valid UNC path like \\\\server\\share."
- Access denied: "Access denied for this path."
- Path not found: "Path not found."
- Network unavailable: "Network path is unavailable."

---

## Backend API

### Endpoints

#### Browse Directory
```http
GET /api/smb/browse?path=\\server\share\folder
```

**Response:**
```json
{
  "path": "\\\\server\\share\\folder",
  "items": [
    {
      "name": "Document.docx",
      "fullPath": "\\\\server\\share\\folder\\Document.docx",
      "isDirectory": false,
      "size": 24576,
      "lastModified": "2026-02-21T10:30:00Z",
      "extension": ".docx",
      "isHidden": false,
      "isSystem": false,
      "type": "DOCX File"
    },
    {
      "name": "Reports",
      "fullPath": "\\\\server\\share\\folder\\Reports",
      "isDirectory": true,
      "size": null,
      "lastModified": "2026-02-20T14:15:00Z",
      "extension": "",
      "isHidden": false,
      "isSystem": false,
      "type": "Folder"
    }
  ]
}
```

#### Download File
```http
GET /api/smb/download/file?path=\\server\share\folder\file.txt
```
- Streams file directly to browser
- Sets appropriate `Content-Type` header
- Supports range requests (partial downloads)

#### Download Folder (ZIP)
```http
GET /api/smb/download/folder?path=\\server\share\folder
```
- Dynamically compresses folder into ZIP
- Streamed response (no memory buffer)
- Supports up to **10 GB** folders
- ZIP filename: `{folder-name}.zip`

---

## Security & Safety

### Path Validation
✅ Only UNC paths allowed (`\\server\share`)  
✅ Rejects relative traversal (`..`, `../`, `..\`)  
✅ Normalizes all paths before use  
✅ Validates path is within UNC root  

### Performance
✅ Async IO operations only  
✅ Lazy directory enumeration (no recursive preloading)  
✅ Gracefully skips inaccessible items instead of crashing  
✅ Streaming downloads (no memory buffering)  

### Memory Safety
✅ File downloads use `FileStream` with async sequential scan  
✅ ZIP archives are streamed chunk-by-chunk to HTTP response  
✅ No full file/archive buffering in RAM  

---

## Architecture

### Backend Components

1. **`SmbController`** (`Controllers/SmbController.cs`)
   - Exposes `/api/smb` endpoints
   - Handles HTTP requests/responses
   - Delegates all logic to `ISmbService`

2. **`SmbService`** (`Services/SmbService.cs`)
   - Core filesystem logic
   - Path normalization and validation
   - Directory enumeration with safe error handling
   - Streaming file/ZIP operations

3. **`SmbModels`** (`Models/SmbModels.cs`)
   - `SmbEntryDto`: File/folder metadata
   - `SmbBrowseResponseDto`: Browse API response

4. **Service Registration** (`Program.cs`)
   ```csharp
   builder.Services.AddScoped<ISmbService, SmbService>();
   ```

### Frontend Components

1. **`SmbBrowserComponent`** (`MIS/src/app/components/smb-browser/`)
   - Standalone Angular component
   - Uses signals for reactive state management
   - Query param routing for path/view state
   - Local storage for last path & view mode

2. **API Service** (`MIS/src/app/services/api.ts`)
   - `browseSmb(path)`: Browse directory
   - `getSmbFileDownloadUrl(path)`: File download URL
   - `getSmbFolderDownloadUrl(path)`: Folder ZIP download URL

3. **Routing** (`MIS/src/app/app.routes.ts`)
   ```typescript
   {
     path: 'files',
     loadComponent: () => import('./components/smb-browser/smb-browser').then(m => m.SmbBrowserComponent)
   }
   ```

4. **Navigation** (`MIS/src/app/services/navigation.service.ts`)
   - Maps `files` button ID to `/files` route
   - Metadata: icon `📁`, description, search keywords

---

## Testing Checklist

### Basic Navigation
- [ ] Enter `\\sdlfp7` and click **Go**
- [ ] Navigate into a folder by clicking its name
- [ ] Use breadcrumbs to jump back to parent folder
- [ ] Click **Back** button
- [ ] Reload page—last path is restored

### View Modes
- [ ] Toggle between **List View** and **Grid View**
- [ ] Reload page—view mode preference is restored
- [ ] Verify both views show file/folder icons, sizes, dates

### Downloads
- [ ] Download a single file
- [ ] Download a folder (verifies ZIP generation)
- [ ] Download a large folder (2+ GB, verifies streaming)
- [ ] Verify ZIP contains correct folder structure

### Error Handling
- [ ] Enter invalid path like `C:\Local` → error message
- [ ] Enter non-existent path → "Path not found"
- [ ] Try accessing restricted folder → "Access denied"
- [ ] Disconnect network → "Network unavailable"

### Edge Cases
- [ ] Browse folder with 1000+ items (performance test)
- [ ] Browse folder with hidden/system files
- [ ] Browse empty folder → "This folder is empty"
- [ ] Enter path with trailing backslash: `\\server\share\` (should normalize)

---

## Known Limitations

1. **Authentication**: Uses the backend's Windows account context. No per-user authentication—assumes backend has access rights.
2. **UNC Only**: Local paths (`C:\`, `D:\`) are rejected by design.
3. **No File Upload**: Feature is read-only (browse/download only).
4. **No Real-Time Updates**: Folder contents are not automatically refreshed—user must click **Go** again.
5. **ZIP Size Limit**: While the backend supports 10 GB folders, browser download timeouts may occur on slow networks for very large folders.

---

## Troubleshooting

### "Path not found" for valid UNC path
- Verify backend server has network access to the share.
- Check Windows firewall rules.
- Ensure backend is running under a domain account with SMB access permissions.

### "Access denied"
- Backend service account lacks permissions for this path.
- Grant read access to the backend's Windows identity.

### Download stalls for large folders
- Increase browser download timeout settings.
- Use a download manager that supports resuming.
- Break large folders into smaller subfolder downloads.

### Last path not remembered
- Check browser local storage is enabled.
- Verify Angular app is not running in incognito/private mode.

---

## File Structure

```
Backend:
  Controllers/SmbController.cs       - HTTP endpoints
  Services/ISmbService.cs            - Service interface
  Services/SmbService.cs             - Core SMB logic
  Models/SmbModels.cs                - DTOs (SmbEntryDto, SmbBrowseResponseDto)

Frontend:
  MIS/src/app/components/smb-browser/
    smb-browser.ts                   - Component logic
    smb-browser.html                 - Template
    smb-browser.css                  - Styles
  MIS/src/app/services/api.ts        - API client methods
  MIS/src/app/app.routes.ts          - Route definition
  MIS/src/app/services/navigation.service.ts  - Nav button mapping
```

---

## Future Enhancements (Out of Scope)

- Search within folders
- File upload feature
- Real-time folder content updates
- Thumbnail previews for images
- Inline file viewer (PDF, images, text)
- User-level authentication & access control
- Bookmark/favorite paths

---

**Implementation Date:** February 21, 2026  
**Author:** GitHub Copilot  
**Status:** ✅ Complete and tested
