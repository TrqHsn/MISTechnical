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
- Service: `Services/ActiveDirectoryService.cs` and `IActiveDirectoryService.cs` (core AD logic)
- Helpers: `Helpers/DocxHelper.cs` (DOCX template filling with placeholder replacement), `PrintHelper.cs` (thermal label printing utilities)
- DTOs: `Models/` (`UserDto.cs`, `ComputerDto.cs`, `UpdateUserDto.cs`, `UnlockDtos.cs`, `UpdateDescriptionDto.cs`)
- Frontend API client: `MIS/src/app/services/api.ts` (points at `http://localhost:5001/api`)
- Main app: `MIS/src/app/app.ts` & `app.html` (root component with work timer, unlock modal, button nav)
- Routes: `MIS/src/app/app.routes.ts` (lazy-loaded components via `loadComponent`)
- Components: `MIS/src/app/components/` (ad-tools, label-print, network, inventory-search, service-tag, stress-cpu-gpu, os-installation-form, job-sheet)

## Big-picture & architecture 💡
- **Monolith API:** Single-process .NET Web API that communicates directly with AD via LDAP (`System.DirectoryServices`). No database/ORM; domain data is read/written directly to AD.
- **Angular SPA (SSR):** Angular 21 with standalone components, signals-based reactivity, and Server-Side Rendering (`outputMode: "server"`). Uses `@for` and `@if` control flow syntax (new Angular template syntax).
- **Service boundary:** Controllers call `IActiveDirectoryService` — mock this interface for unit tests or to simulate AD.
- **CORS:** `AllowAngularApp` policy allows `http://localhost:4200`, `http://10.140.9.252:4200`, and `http://10.140.5.32:4200` (IPs for deployed frontend).
- **Search behavior:** `SearchComputersByName` searches **both** computer `name` and `description` using a single `GET /api/computers/search?searchTerm=...` endpoint — there is **no** separate `search/description` route in code (README may list an outdated route).
- **Additional controllers:**
  - `NetworkController`: Streaming ping via Server-Sent Events (SSE). Manages background `ping.exe` processes with `ConcurrentDictionary` for session tracking. POST `/api/network/ping/start` returns continuous output; POST `/api/network/ping/stop` terminates by session ID.
  - `LabelPrintController`: Windows-only (`[SupportedOSPlatform("windows")]`). Prints to "SEWOO Label Printer" using `System.Drawing.Printing`. Accepts label text, font config, and prints 60x15mm thermal labels via POST `/api/print/label`.
  - `InventoryController`: Reverse proxy to `http://sdlportal.dewhirst.grp/inventory/csv.php?type=all`. Returns CSV data via GET `/api/inventory/csv`. Uses `IHttpClientFactory`.

## Runtime & important runtime notes ⚠️
- **Windows + domain join required:** `ActiveDirectoryService` calls `Domain.GetCurrentDomain()` and creates `LDAP://{domain}`; it will fail on non-domain or Linux environments.
- **Ports:** `Program.cs` uses `builder.WebHost.UseUrls("http://localhost:5001")`. (Note: `README.md` still references port `5000` — prefer the value in `Program.cs`.)
- **Swagger:** Available in Development at `/swagger`.
- **Angular:** SSR-enabled (`outputMode: "server"`), uses Vitest for tests, and npm@11.6.2 as package manager.

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

## Important implementation details & gotchas 🧠
- **Title <-> Description mirroring:** When updating user attributes, **Title** is mirrored into **Description** if provided. Both backend and frontend implement this behavior; keep them in sync when changing update logic.
- **Manager resolution:** `UpdateUserAttributesByUserPrincipalNameAsync` accepts manager identifiers as UPN, sAMAccountName, or DisplayName. It resolves UPN/sAMAccountName first, then attempts an **exact** displayName match and will throw on ambiguous results.
- **Unlocking users:** `UnlockAllLockedUsersAsync` tries `de.Invoke("UnlockAccount")` then falls back to clearing `lockoutTime` if needed; returned `UnlockResultDto` contains `unlocked` and `failed` lists. Frontend triggers this via "Unlock" button and displays results in a modal (see `app.ts` `openUnlockDialog()` and `app.html` unlock modal).
- **Device numbering:** `GetLastDeviceNumbersAsync` expects computer names matching regex `^([A-Z]+)(\d+)([A-Z]*)$` and only considers prefixes `SDLL`, `SDLD`, `DBOL`.
- **Computer description endpoints:**
  - `PUT /api/computers/{computerName}/description` expects a JSON string body (e.g., `"New description"`).
  - `PATCH /api/computers/{computerName}/description` accepts `{ "description": "..." }` and returns the updated `ComputerDto`.
- **Bulk user updates:** `UpdateUserInfoComponent` supports Excel (.xlsx) uploads with headers `UPN,Department,Title,Manager` (case-insensitive), max 1000 rows. Uses SheetJS (`xlsx` package) for parsing.

## Typical developer workflows (commands) ▶️
- **API (root):**
  - Restore: `dotnet restore`
  - Run: `dotnet run` (API listens on `http://localhost:5001` per `Program.cs`)
- **Frontend (in `MIS/`):**
  - Install: `npm install`
  - Serve: `ng serve` or `ng serve --host 0.0.0.0 --port 4200` (for network access)
  - Build: `ng build`
  - Tests: `ng test` (Vitest)
- **Debugging:** Run API locally and use Swagger to exercise endpoints; point the Angular app to the API URL in `MIS/src/app/services/api.ts`.

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

---
If anything above is unclear or you'd like a different level of detail (e.g., a test scaffolding example or a small sample integration test), tell me which part to expand and I will iterate. ✅