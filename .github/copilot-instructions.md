# Copilot / Agent Instructions for ADApi

## Project Overview
- **Backend:** .NET 10 Web API (no database, direct AD via `System.DirectoryServices`).
- **Frontend:** Angular 21 SPA (SSR, signals, new template syntax) in `MIS/`.
- **Platform:** Windows, domain-joined required for AD access.
- **Key Features:** AD user/computer/device management, digital signage (kiosk), network tools, label printing, inventory proxy.

## Architecture & Service Boundaries
- **Controllers:** In `Controllers/` (e.g., `UsersController.cs`, `ComputersController.cs`, `KioskController.cs`).
- **AD Logic:** All AD access via `IActiveDirectoryService`/`ActiveDirectoryService.cs` (sync LDAP, wrapped in `Task.Run`).
- **Kiosk Logic:** `KioskService`/`IKioskService` (in-memory, playlist/schedule/media CRUD, no DB).
- **Helpers:** `Helpers/DocxHelper.cs` (DOCX templates), `PrintHelper.cs` (thermal label printing).
- **DTOs:** In `Models/` (e.g., `UserDto.cs`, `ComputerDto.cs`).
- **Frontend API:** `MIS/src/app/services/api.ts` (main), `kiosk-api.ts` (kiosk endpoints).

## Developer Workflows
- **API:**
  - Restore: `dotnet restore`
  - Run: `dotnet run` (listens on `http://localhost:5001`)
  - Watch: `dotnet watch run`
- **Frontend:**
  - Install: `npm install` (in `MIS/`)
  - Serve: `ng serve` (SSR, `http://localhost:4200`)
  - Build: `ng build`
  - Test: `ng test` (Vitest)
- **Debug:** Use Swagger (`/swagger`) for API, point Angular API client to backend URL.

## Key Patterns & Conventions
### Backend
- **Error Handling:** Controllers return `BadRequest`, `NotFound`, or `StatusCode(500, { error, message })` and log with `ILogger`.
- **Mapping:** AD-to-DTO mapping in `ActiveDirectoryService`; mapping errors are swallowed (return `null`).
- **SSE:** Always clean up background processes on disconnect (see `NetworkController`).
- **Windows-only:** Label printing (`LabelPrintController`) is `[SupportedOSPlatform("windows")]` and hardcoded to "SEWOO Label Printer".

### Frontend
- **Signals:** Use Angular signals for state, not RxJS for local state.
- **New Syntax:** Use `@for`/`@if` (not `*ngFor`/`*ngIf`).
- **Standalone Components:** All components are standalone; lazy load via `loadComponent` in routes.
- **Debounced Search:** Use RxJS Subject + `debounceTime` for search inputs.
- **Universal Search:** Ctrl+K/Cmd+K opens global search (see `UNIVERSAL_SEARCH_README.md`).
- **SSR Gotchas:** Check `typeof window !== 'undefined'` before using browser APIs.

## Integration & Data Flows
- **No DB:** All data is live from AD or in-memory (kiosk).
- **Kiosk Display:** `/displayboard` is plain HTML/JS (no Angular), polls `/api/kiosk/display/content` every 10s.
- **Media:** Uploaded to `wwwroot/displayboard/`, served at `/displayboard/{filename}`.
- **Inventory:** Proxied from external CSV endpoint via `InventoryController`.

## Project-Specific Details
- **Title/Description Mirroring:** When updating user, `Title` is mirrored to `Description` if provided (backend & frontend).
- **Manager Resolution:** Accepts UPN, sAMAccountName, or DisplayName; throws on ambiguous display names.
- **Device Numbering:** Only prefixes `SDLL`, `SDLD`, `DBOL` are considered (see regex in `GetLastDeviceNumbersAsync`).
- **Bulk User Update:** Excel upload (SheetJS) with `UPN,Department,Title,Manager` headers, max 1000 rows.
- **Kiosk:** All scheduling is server-side; client only polls and displays.

## Examples
- Get user: `GET /api/users/john.doe`
- Search computers: `GET /api/computers/search?searchTerm=PC01`
- Update computer description: `PUT /api/computers/PC01/description` (body: `"New description"`)
- Kiosk: `GET /api/kiosk/display/content`, upload media: `POST /api/kiosk/media/upload`

---
If any section is unclear or missing, please specify which part to expand or clarify.