# Digital Signage / Kiosk System

## Overview

Production-ready digital signage system designed for 24/7 TV/kiosk displays with server-controlled content management, offline resilience, and KaiOS browser compatibility.

## Architecture

### Critical Design Principles

1. **Fixed URL (Non-Negotiable):** TV displays open ONE permanent URL and NEVER navigate
2. **Server-Side Logic:** All scheduling and content decisions happen on the server
3. **Offline Resilience:** Display continues showing cached content when server is unreachable
4. **KaiOS Compatible:** TV display uses plain HTML/JS (NO frameworks, minimal JavaScript)
5. **Separation of Concerns:** Admin panel (Angular) is completely separate from TV display (plain HTML)

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    TV/Kiosk Display                         │
│  URL: http://IP:4200/displayboard (FIXED, NEVER CHANGES)   │
│  Tech: Plain HTML + Vanilla JS (KaiOS compatible)          │
│  Polls: /api/kiosk/display/content every 10 seconds        │
│  Fallback: Cached content in localStorage                  │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ Polls every 10s
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API (.NET)                        │
│  - KioskController: Media upload, playlists, schedules      │
│  - KioskService: Content resolution, scheduling logic       │
│  - Storage: wwwroot/displayboard/ (media files)             │
│  - Critical: GET /api/kiosk/display/content                 │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ Manages content
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Admin Panel (Angular)                     │
│  URL: http://IP:4200/kiosk-admin                           │
│  - Upload images/videos                                     │
│  - Create playlists with rotation timing                    │
│  - Schedule content by time/day                             │
│  - Priority-based conflict resolution                       │
└─────────────────────────────────────────────────────────────┘
```

## Features

### Content Management

- **Media Library:** Upload images (JPG, PNG, GIF) and videos (MP4, WebM)
- **Playlists:** Group media items with individual display durations
- **Scheduling:** Time-based content scheduling with day-of-week support
- **Priority System:** Handle overlapping schedules with priority-based resolution

### TV Display Capabilities

- **Automatic Rotation:** Playlist items rotate based on configured durations
- **Video Playback:** Native HTML5 video support with auto-play and loop
- **Offline Mode:** Continues displaying last known content when connection lost
- **Cache-Busting:** Prevents stale content with timestamp query parameters
- **Responsive:** Adapts to different screen sizes while maintaining aspect ratio

## File Structure

```
Backend:
├── Controllers/KioskController.cs        # API endpoints
├── Services/
│   ├── IKioskService.cs                  # Service interface
│   └── KioskService.cs                   # Business logic
├── Models/KioskModels.cs                 # DTOs and entities
└── wwwroot/displayboard/                 # Media file storage

Frontend (Admin):
└── MIS/src/app/
    ├── services/kiosk-api.ts             # HTTP client
    └── components/kiosk-admin/           # Admin UI
        ├── kiosk-admin.ts                # Component logic
        ├── kiosk-admin.html              # Template
        └── kiosk-admin.css               # Styles

Frontend (TV Display):
└── MIS/public/displayboard/
    ├── index.html                        # Main display page
    ├── display.js                        # Rotation engine
    └── display.css                       # Fullscreen styles
```

## Setup

### 1. Start Backend API

```bash
cd "c:\ad PROJECT"
dotnet watch run
```

API will listen on `http://localhost:5001`

### 2. Start Angular Development Server

```bash
cd "c:\ad PROJECT\MIS"
ng serve --host 0.0.0.0
```

Frontend will listen on `http://localhost:4200`

### 3. Access Interfaces

- **Admin Panel:** `http://localhost:4200/kiosk-admin`
- **TV Display:** `http://localhost:4200/displayboard` (configure TV to this URL)

## Usage Workflow

### 1. Upload Media

1. Navigate to Admin Panel → Media Library tab
2. Click "Choose File" and select image or video
3. Optionally add description
4. Click "Upload"

Supported formats:
- Images: .jpg, .jpeg, .png, .gif
- Videos: .mp4, .webm (KaiOS compatible codecs only)

### 2. Create Playlists

1. Go to Playlists tab
2. Click "+ New Playlist"
3. Enter playlist name and description
4. Click "+ Add Item" to add media
5. For each item:
   - Select media from dropdown
   - Set duration in seconds (how long it displays)
   - Order is automatic
6. Click "Create Playlist"

### 3. Schedule Content

1. Go to Schedules tab
2. Click "+ New Schedule"
3. Configure:
   - **Name:** Descriptive name (e.g., "Morning Announcements")
   - **Content Type:** Playlist or Single Image/Video
   - **Content:** Select playlist or media
   - **Start/End Time:** Time range (e.g., 09:00 - 17:00)
   - **Day of Week:** Specific day or "Every Day"
   - **Priority:** Higher number wins if schedules overlap
4. Click "Create Schedule"

### 4. Configure TV

1. Open TV browser
2. Navigate to: `http://YOUR_SERVER_IP:4200/displayboard`
3. Set browser to fullscreen (F11 on most browsers)
4. **Do not navigate away** - all updates happen automatically

## API Endpoints

### Media Management

```
POST   /api/kiosk/media/upload          # Upload media file
GET    /api/kiosk/media                 # List all media
GET    /api/kiosk/media/{id}            # Get media by ID
DELETE /api/kiosk/media/{id}            # Delete media
```

### Playlist Management

```
POST   /api/kiosk/playlists             # Create playlist
PUT    /api/kiosk/playlists/{id}        # Update playlist
GET    /api/kiosk/playlists             # List all playlists
GET    /api/kiosk/playlists/{id}        # Get playlist by ID
DELETE /api/kiosk/playlists/{id}        # Delete playlist
```

### Schedule Management

```
POST   /api/kiosk/schedules             # Create schedule
PUT    /api/kiosk/schedules/{id}        # Update schedule
GET    /api/kiosk/schedules             # List all schedules
GET    /api/kiosk/schedules/{id}        # Get schedule by ID
DELETE /api/kiosk/schedules/{id}        # Delete schedule
PATCH  /api/kiosk/schedules/{id}/toggle # Activate/deactivate
```

### Display Endpoint (Critical)

```
GET    /api/kiosk/display/content       # Get current active content (TV polls this)
POST   /api/kiosk/display/heartbeat     # Record heartbeat (monitoring)
```

## Technical Details

### Content Resolution Logic

Server resolves active content in this order:

1. Find schedules matching current time and day
2. Filter by `isActive = true`
3. Sort by priority (highest first)
4. Return highest priority schedule
5. If no schedule matches, return fallback (first playlist or first media)

### Offline Fallback Mechanism

1. **Normal Operation:** TV polls `/api/kiosk/display/content` every 10 seconds
2. **Content Received:** Display content + cache to localStorage
3. **Connection Lost:** Continue displaying cached content
4. **Show Offline Banner:** Red banner at top of screen
5. **Auto-Retry:** Keep polling every 10 seconds
6. **Connection Restored:** Resume normal operation + hide banner

### Cache-Busting Strategy

All media URLs include timestamp query parameter:
```javascript
/displayboard/image123.jpg?t=1673648400000
```

This prevents KaiOS aggressive caching from showing stale content.

### Storage (In-Memory vs Database)

**Current Implementation (In-Memory):**
- `KioskService` uses `ConcurrentDictionary`
- Data lost on server restart
- Suitable for development/testing

**Production Recommendation:**
- Replace with Entity Framework Core + SQL Server/PostgreSQL
- Persist media metadata, playlists, schedules
- Keep file storage in `wwwroot/displayboard/`

## Configuration

### Update API URL

**For Admin Panel:**
Edit `MIS/src/app/services/kiosk-api.ts`:
```typescript
private apiUrl = 'http://YOUR_SERVER_IP:5001/api/kiosk';
```

**For TV Display:**
Edit `MIS/public/displayboard/display.js`:
```javascript
const CONFIG = {
  API_BASE: 'http://YOUR_SERVER_IP:5001/api',
  // ...
};
```

### Adjust Polling Interval

Edit `MIS/public/displayboard/display.js`:
```javascript
POLL_INTERVAL: 10000,  // 10 seconds (adjust as needed)
```

### Enable Status Overlay (Debugging)

Edit `MIS/public/displayboard/display.js`:
```javascript
ENABLE_STATUS_OVERLAY: true  // Shows server time, schedule name, last update
```

## Troubleshooting

### TV shows "Loading content..."
- Check network connection from TV to server
- Verify API is running (`http://SERVER_IP:5001/swagger`)
- Check browser console for errors (if accessible)

### Content not updating
- Verify schedule times and day-of-week settings
- Check schedule priority if multiple schedules overlap
- Ensure schedule `isActive = true`

### Videos not playing
- KaiOS has limited codec support (H.264 recommended)
- Ensure video file size is reasonable (<50MB)
- Check browser console for video load errors

### Offline banner stuck
- Server may be unreachable - check connectivity
- API endpoint `/api/kiosk/display/content` may be failing
- Check server logs for errors

## Production Deployment Checklist

- [ ] Replace in-memory storage with database
- [ ] Configure media file storage path
- [ ] Set up automated backups for media files
- [ ] Implement authentication for admin panel
- [ ] Configure CORS for production IPs
- [ ] Set up monitoring/alerting for TV heartbeats
- [ ] Test offline fallback behavior
- [ ] Configure firewall rules for TV displays
- [ ] Document TV MAC addresses and IPs
- [ ] Set up content approval workflow (if needed)

## Why This Architecture?

### Fixed URL Requirement
Kiosks/TVs are often managed remotely or locked down. Changing the URL requires physical access or complex remote management. A fixed URL allows "set and forget" deployment.

### Server-Side Scheduling
The TV display is "dumb" by design - it just shows what the server tells it to. This means:
- Schedule changes apply instantly (no TV reconfiguration)
- Time zones handled server-side (no TV clock drift issues)
- Complex business logic stays on the server

### Plain HTML for TV
Frameworks like Angular are designed for user interaction, not passive display. Benefits of plain HTML:
- Minimal memory footprint
- No framework update churn
- KaiOS compatibility guaranteed
- Faster load times
- Easier to debug on low-end hardware

### Angular for Admin
Rich user interaction (file uploads, drag-drop, forms) benefits from a framework. Separation means admin complexity doesn't affect TV stability.

## Support

For issues, questions, or feature requests, contact the development team or create an issue in the project repository.
