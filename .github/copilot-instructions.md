# Copilot / Agent instructions for ADApi

## Quick summary ✅
- **Project:** .NET 10 Web API (`net10.0`) that queries Active Directory (AD) + Angular 21 frontend (SSR-enabled) in `MIS/`.
- **Platform:** Windows/domain-joined machine required for AD access (uses `System.DirectoryServices`).
- **Run:** API via `dotnet run` (listens on `http://localhost:5001`). Frontend with `ng serve` in `MIS/` (listens on `http://localhost:4200`).

## Where to look (important files) 🔎
- API entry: `Program.cs` (CORS, URL binding, Swagger, DI container)
- Controllers: `Controllers/` 
  - AD-related: `UsersController.cs`, `ComputersController.cs`, `DevicesController.cs`
  - Utility: `NetworkController.cs` (SSE ping streaming), `LabelPrintController.cs` (Windows-only thermal printing), `InventoryController.cs` (CSV proxy)
  - Kiosk/Digital Signage: `KioskController.cs` (media upload, playlist/schedule CRUD, display content API)
- Service: `Services/ActiveDirectoryService.cs` and `IActiveDirectoryService.cs` (core AD logic)
- Kiosk Service: `Services/KioskService.cs` and `IKioskService.cs` (digital signage business logic, in-memory storage)
- Helpers: `Helpers/DocxHelper.cs` (DOCX template filling with placeholder replacement), `PrintHelper.cs` (thermal label printing utilities)
- DTOs: `Models/` (`UserDto.cs`, `ComputerDto.cs`, `UpdateUserDto.cs`, `UnlockDtos.cs`, `UpdateDescriptionDto.cs`, `KioskModels.cs`)
- Frontend API client: `MIS/src/app/services/api.ts` (points at `http://localhost:5001/api`)
- Kiosk API client: `MIS/src/app/services/kiosk-api.ts` (kiosk endpoints)
- Main app: `MIS/src/app/app.ts` & `app.html` (root component with work timer, unlock modal, button nav)
- Routes: `MIS/src/app/app.routes.ts` (lazy-loaded components via `loadComponent`)
- Components: `MIS/src/app/components/` (ad-tools, print, network, inventory-search, stress-cpu-gpu, os-installation-form, kiosk-admin, important-links, toast)
- Kiosk Display: `MIS/public/displayboard/index.html` (fixed URL TV display - plain HTML/JS, NO Angular)
- **Documentation:** Root `*.md` files contain detailed implementation notes:
  - `KIOSK_SYSTEM_README.md` - Digital signage architecture
  - `TOAST_NOTIFICATION_SYSTEM.md` - Toast notification usage
  - `LAST_DEVICE_IMPLEMENTATION.md` - Device numbering logic
  - `NEW_USER_TEMPLATE_README.md` - New user DOCX template system

## Big-picture & architecture 💡
- **Monolith API:** Single-process .NET Web API that communicates directly with AD via LDAP (`System.DirectoryServices`). No database/ORM; domain data is read/written directly to AD.
- **Angular SPA (SSR):** Angular 21 with standalone components, signals-based reactivity, and Server-Side Rendering (`outputMode: "server"`). Uses `@for` and `@if` control flow syntax (new Angular template syntax).
- **Digital Signage/Kiosk System:** Server-controlled content management for 24/7 TV displays. Fixed URL display (`/displayboard`) uses plain HTML/JS (NO Angular) for KaiOS compatibility. Admin panel is Angular-based (`/kiosk-admin`).
- **Service boundary:** Controllers call `IActiveDirectoryService` — mock this interface for unit tests or to simulate AD.
- **CORS:** `AllowAngularApp` policy allows `http://localhost:4200`, `http://10.140.9.252:4200`, and `http://10.140.5.32:4200` (IPs for deployed frontend).
- **Search behavior:** `SearchComputersByName` searches **both** computer `name` and `description` using a single `GET /api/computers/search?searchTerm=...` endpoint — there is **no** separate `search/description` route in code (README may list an outdated route).
- **Additional controllers:**
  - `NetworkController`: Streaming ping via Server-Sent Events (SSE). Manages background `ping.exe` processes with `ConcurrentDictionary` for session tracking. POST `/api/network/ping/start` returns continuous output; POST `/api/network/ping/stop` terminates by session ID.
  - `LabelPrintController`: Windows-only (`[SupportedOSPlatform("windows")]`). Prints to "SEWOO Label Printer" using `System.Drawing.Printing`. Accepts label text, font config, and prints 60x15mm thermal labels via POST `/api/print/label`.
  - `InventoryController`: Reverse proxy to `http://sdlportal.dewhirst.grp/inventory/csv.php?type=all`. Returns CSV data via GET `/api/inventory/csv`. Uses `IHttpClientFactory`.
  - `KioskController`: Digital signage management. Media upload to `wwwroot/displayboard/`, playlist/schedule CRUD, and **critical endpoint** GET `/api/kiosk/display/content` that TV polls every 10 seconds for active content.

## Runtime & important runtime notes ⚠️
- **Windows + domain join required:** `ActiveDirectoryService` calls `Domain.GetCurrentDomain()` and creates `LDAP://{domain}`; it will fail on non-domain or Linux environments.
- **Ports:** `Program.cs` binds to `http://0.0.0.0:5001` (listens on all network interfaces). Frontend on `http://localhost:4200`.
- **Swagger:** Available in Development at `/swagger`.
- **Angular:** SSR-enabled (`outputMode: "server"`), uses Vitest for tests, and npm@11.6.2 as package manager.
- **Toast notifications:** Frontend includes a toast notification system (see `MIS/src/app/services/toast.service.ts` and `MIS/src/app/components/toast/`). Use `toastService.show()` for user feedback. Docs in `TOAST_NOTIFICATION_SYSTEM.md`.
- **Key dependencies:**
  - Backend: `System.DirectoryServices` (AD), `DocumentFormat.OpenXml` (DOCX templates), `System.Drawing.Common` (thermal printing)
  - Frontend: `xlsx`/`exceljs` (Excel parsing for bulk user updates), `three` (3D stress testing), RxJS (reactive patterns)

## Key patterns & conventions 🔧
### Backend (.NET)
- AD calls are synchronous DirectoryEntry/DirectorySearcher operations wrapped in `Task.Run(...)` to keep async method signatures.
- Mapping and parsing live in `ActiveDirectoryService` (`MapToUserDto`, `MapToComputerDto`). Mapping exceptions are typically swallowed (returning `null`) — be careful when changing these mappings.
- Controllers follow a consistent error contract: return `BadRequest`, `NotFound`, or `StatusCode(500, new { error, message })` and **log** exceptions with ILogger.

### Frontend (Angular)
- **Signals everywhere:** State management uses Angular signals (`signal()`, `computed()`, etc.) instead of RxJS BehaviorSubject for local component state.
- **New template syntax:** Uses `@for (item of items; track item.id)` and `@if (condition)` instead of `*ngFor`/`*ngIf`.
- **Standalone components:** All components are standalone (`standalone: true` or `imports: [...]` in `@Component` decorator).
- **Lazy loading:** Routes use `loadComponent: () => import('...')` for code-splitting.
- **Debounced search:** Search inputs use RxJS Subject + `debounceTime(300)` to throttle API calls (see `ad-tools.ts`).
- **Work timer:** Main app component (`app.ts`) includes a work timer that counts time left/until work hours (7:30-16:30).
- **Tabbed interfaces:** Component composition pattern using signals for active tab state (see `forms.ts` for example: `activeTab = signal<'os-form' | 'device-form'>('os-form')` with `@if` conditionals).

## Important implementation details & gotchas 🧠
- **Title <-> Description mirroring:** When updating user attributes, **Title** is mirrored into **Description** if provided. Both backend and frontend implement this behavior; keep them in sync when changing update logic.
- **Manager resolution:** `UpdateUserAttributesByUserPrincipalNameAsync` accepts manager identifiers as UPN, sAMAccountName, or DisplayName. It resolves UPN/sAMAccountName first, then attempts an **exact** displayName match and will throw on ambiguous results.
- **Unlocking users:** `UnlockAllLockedUsersAsync` tries `de.Invoke("UnlockAccount")` then falls back to clearing `lockoutTime` if needed; returned `UnlockResultDto` contains `unlocked` and `failed` lists. Frontend triggers this via "Unlock" button and displays results in a modal (see `app.ts` `openUnlockDialog()` and `app.html` unlock modal).
- **Device numbering:** `GetLastDeviceNumbersAsync` expects computer names matching regex `^([A-Z]+)(\d+)([A-Z]*)$` and only considers prefixes `SDLL`, `SDLD`, `DBOL`.
- **Computer description endpoints:**
  - `PUT /api/computers/{computerName}/description` expects a JSON string body (e.g., `"New description"`).
  - `PATCH /api/computers/{computerName}/description` accepts `{ "description": "..." }` and returns the updated `ComputerDto`.
- **Bulk user updates:** `UpdateUserInfoComponent` supports Excel (.xlsx) uploads with headers `UPN,Department,Title,Manager` (case-insensitive), max 1000 rows. Uses SheetJS (`xlsx` package) for parsing.
- **Kiosk/Digital Signage critical patterns:**
  - **Fixed URL requirement:** TV display at `/displayboard` (or `http://IP:4200/displayboard`) must NEVER navigate. All content updates happen via polling, not navigation.
  - **Server-side scheduling:** `KioskService.GetActiveContentAsync()` resolves which content displays based on server time, schedule priority, and day-of-week. Client (TV) has NO scheduling logic.
  - **Offline fallback:** `display.js` caches last known content in localStorage. If server unreachable, continues displaying cached content until connection restored.
  - **Cache-busting:** All media URLs include `?t=` timestamp query param to prevent KaiOS aggressive caching.
  - **In-memory storage:** `KioskService` uses `ConcurrentDictionary` for in-memory storage. Replace with database for production persistence.
  - **Media storage:** Uploaded files saved to `wwwroot/displayboard/` (served at `/displayboard/{filename}`).

## Typical developer workflows (commands) ▶️
- **API (root):**
  - Restore: `dotnet restore`
  - Run: `dotnet run` (API listens on `http://localhost:5001` per `Program.cs`)
  - Watch mode: `dotnet watch run` (auto-recompiles on file changes)
- **Frontend (in `MIS/`):**
  - Install: `npm install`
  - Serve: `ng serve` or `ng serve --host 0.0.0.0 --port 4200` (for network access)
  - Build: `ng build`
  - Tests: `ng test` (Vitest)
- **Debugging:** Run API locally and use Swagger to exercise endpoints; point the Angular app to the API URL in `MIS/src/app/services/api.ts`.
- **Typical setup:** Run `dotnet watch run` in root terminal and `ng serve` in `MIS/` terminal for full-stack development with auto-reload.

## Testing & safety notes 🧪
- There are no AD integration tests in the repo. For unit tests, **mock `IActiveDirectoryService`** rather than testing with real AD unless you have a dedicated test AD environment.
- If adding integration tests that touch AD, isolate/recreate a dedicated test environment (domain-joined VM) and never run destructive operations against production AD.

## How an AI agent should contribute 🤖
- Small, focused PRs with a short description and a single area of change (e.g., "Refactor AD mapping for manager string parsing").
- When changing AD logic, extract pure parsing/formatting logic into small static helpers and add unit tests; keep LDAP calls in `ActiveDirectoryService` thin.
- When adding endpoints, follow existing error patterns and DTO usage in `Models/`.
- When adding Angular components, use standalone components with signals, new template syntax (`@for`, `@if`), and lazy loading via `loadComponent`.

## Quick examples (copy/paste) 📋
- Get user: `GET http://localhost:5001/api/users/john.doe`
- Search computers: `GET http://localhost:5001/api/computers/search?searchTerm=PC01`
- Update description (client example in `MIS/src/app/services/api.ts`):
  - `PUT http://localhost:5001/api/computers/PC01/description` body: `"New description"` (Content-Type: application/json)
- Update user attributes: `PUT http://localhost:5001/api/users/john.doe@domain.com/attributes` body: `{ "department": "IT", "title": "Developer", "manager": "jane.doe@domain.com" }`
- **Kiosk System:**
  - TV Display URL: `http://localhost:4200/displayboard` (plain HTML, polls every 10s)
  - Admin Panel: `http://localhost:4200/kiosk-admin` (Angular, manage content)
  - Get active content: `GET http://localhost:5001/api/kiosk/display/content`
  - Upload media: `POST http://localhost:5001/api/kiosk/media/upload` (multipart/form-data)
  - Create playlist: `POST http://localhost:5001/api/kiosk/playlists` body: `{ "name": "Morning Playlist", "items": [{ "mediaId": 1, "durationSeconds": 15, "order": 0 }] }`
  - Create schedule: `POST http://localhost:5001/api/kiosk/schedules` body: `{ "name": "9-5 Schedule", "contentType": 0, "playlistId": 1, "startTime": "09:00", "endTime": "17:00", "priority": 10 }`

---
If anything above is unclear or you'd like a different level of detail (e.g., a test scaffolding example or a small sample integration test), tell me which part to expand and I will iterate. ✅