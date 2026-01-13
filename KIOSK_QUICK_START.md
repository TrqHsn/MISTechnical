# 🚀 Digital Signage Quick Start Guide

## 5-Minute Setup

### Step 1: Start Backend (Terminal 1)
```powershell
cd "c:\ad PROJECT"
dotnet watch run
```
✅ API running at: `http://localhost:5001`

### Step 2: Start Frontend (Terminal 2)
```powershell
cd "c:\ad PROJECT\MIS"
ng serve --host 0.0.0.0
```
✅ Frontend running at: `http://localhost:4200`

### Step 3: Configure Content

**Open Admin Panel:** `http://localhost:4200/kiosk-admin`

1. **Upload Media**
   - Click "Media Library" tab
   - Choose image or video file
   - Click "Upload"

2. **Create Playlist**
   - Click "Playlists" tab
   - Click "+ New Playlist"
   - Enter name (e.g., "Morning Slides")
   - Click "+ Add Item"
   - Select media, set duration (10 seconds)
   - Add more items as needed
   - Click "Create Playlist"

3. **Schedule Content**
   - Click "Schedules" tab
   - Click "+ New Schedule"
   - Enter name (e.g., "All Day Loop")
   - Content Type: "Playlist"
   - Select your playlist
   - Start Time: 00:00
   - End Time: 23:59
   - Day of Week: "Every Day"
   - Priority: 10
   - Click "Create Schedule"

### Step 4: Display on TV

**Open TV Browser:** `http://localhost:4200/displayboard`

🎉 **Content now displays automatically!**

Press F11 for fullscreen mode.

---

## 📱 For Network Display (Other Devices)

Replace `localhost` with your computer's IP address:
- Admin: `http://YOUR_IP:4200/kiosk-admin`
- Display: `http://YOUR_IP:4200/displayboard`

Find your IP:
```powershell
ipconfig
```
Look for "IPv4 Address" (e.g., 192.168.1.100)

---

## 🔧 Common Tasks

### Add More Content
1. Go to Media Library → Upload more files
2. Edit existing playlist → Add new items
3. Content updates automatically on TV

### Schedule Different Content by Time
Example: Breakfast menu 8-10am, Lunch menu 11-2pm

1. Create 2 playlists: "Breakfast Menu", "Lunch Menu"
2. Create 2 schedules:
   - Breakfast: 08:00-10:00, Priority 10
   - Lunch: 11:00-14:00, Priority 10

### Test Offline Mode
1. Stop backend (Ctrl+C in Terminal 1)
2. TV shows red "Offline" banner
3. Content continues from cache
4. Restart backend → Auto-reconnects

---

## 📊 Key Concepts

### Fixed URL (Critical!)
- TV opens `/displayboard` **ONCE**
- Never navigate away
- All updates happen automatically via polling

### Server Controls Everything
- Schedule decisions = Server
- Content rotation = Server tells client what/when
- TV just displays what server says

### Offline Resilience
- Content cached in browser localStorage
- Works offline with last known content
- Reconnects automatically when online

---

## 🎯 URLs Reference

| Interface | URL | Purpose |
|-----------|-----|---------|
| Admin Panel | `http://localhost:4200/kiosk-admin` | Manage content |
| TV Display | `http://localhost:4200/displayboard` | Show content |
| API Docs | `http://localhost:5001/swagger` | API documentation |

---

## ❓ Troubleshooting

### "Loading content..." stuck on TV
- ✅ Check backend is running (`http://localhost:5001/swagger`)
- ✅ Check network connection
- ✅ Open browser console (F12) for errors

### Content not rotating
- ✅ Check playlist has multiple items
- ✅ Verify schedule is active (green in admin)
- ✅ Check time range includes current time

### Video not playing
- ✅ Use MP4 format (H.264 codec)
- ✅ Keep file size under 50MB
- ✅ Test video in admin preview first

---

## 📚 Full Documentation

- **Complete Guide:** `KIOSK_SYSTEM_README.md`
- **Implementation Details:** `KIOSK_IMPLEMENTATION_SUMMARY.md`
- **AI Agent Guide:** `.github/copilot-instructions.md`

---

## 🎓 Next Steps

1. **Production Deployment**
   - Replace in-memory storage with database
   - Add authentication to admin panel
   - Configure firewall rules

2. **Advanced Features**
   - Add transition effects
   - Implement content approval workflow
   - Set up monitoring dashboard

3. **Customization**
   - Adjust poll interval in `display.js`
   - Customize styling in `display.css`
   - Add company branding

---

**Need Help?** Check the full documentation or contact the development team.

---

## ⚡ Quick Commands Cheat Sheet

```powershell
# Start backend (with auto-reload)
cd "c:\ad PROJECT" && dotnet watch run

# Start frontend (with network access)
cd "c:\ad PROJECT\MIS" && ng serve --host 0.0.0.0

# Build for production
cd "c:\ad PROJECT\MIS" && ng build

# Check for errors
cd "c:\ad PROJECT" && dotnet build

# View logs
# Backend logs in console where dotnet runs
# Frontend logs in browser console (F12)
```

---

🎬 **Ready to go live!** Configure your TV browser and enjoy automated digital signage.
