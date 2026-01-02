# Copilot / Agent instructions for ADApi

## Quick summary ✅
- **Project:** .NET 9 Web API that queries Active Directory (AD) + an Angular frontend in `MIS/`.
- **Platform:** Windows/domain-joined machine required for AD access (uses `System.DirectoryServices`).
- **Run:** API via `dotnet run` (project targets .NET 9). Frontend with `ng serve` in `MIS/`.

## Where to look (important files) 🔎
- API entry: `Program.cs` (CORS, URL binding, Swagger)
- Controllers: `Controllers/` (`UsersController.cs`, `ComputersController.cs`, `DevicesController.cs`)
- Service: `Services/ActiveDirectoryService.cs` and `IActiveDirectoryService.cs` (core AD logic)
- DTOs: `Models/` (`UserDto.cs`, `ComputerDto.cs`)
- Frontend API client: `MIS/src/app/services/api.ts` (points at `http://localhost:5001/api`)

## Big-picture & architecture 💡
- Single-process Web API that communicates directly with AD via LDAP (`System.DirectoryServices`).
- No database/ORM is used; domain data is read/written directly to AD (e.g., update computer description).
- Angular UI (`MIS/`) consumes API at `/api/...`. CORS policy `AllowAngularApp` allows `http://localhost:4200` and `http://10.140.9.10:4200`.
- Note: `SearchComputersByName` searches **both** computer `name` and `description` using a single `GET /api/computers/search?searchTerm=...` endpoint — there is **no** separate `search/description` route in code (README may list an outdated route).
- Service boundary: controllers call `IActiveDirectoryService` — mock this interface for unit tests or to simulate AD.

## Runtime & important runtime notes ⚠️
- **Windows + domain join required:** `ActiveDirectoryService` calls `Domain.GetCurrentDomain()` and creates `LDAP://{domain}`; it will fail on non-domain or Linux environments.
- **Ports:** `Program.cs` uses `builder.WebHost.UseUrls("http://localhost:5001")`. (Note: `README.md` still references port `5000` — prefer the value in `Program.cs`.)
- **Swagger:** Available in Development at `/swagger`.

## Key patterns & conventions 🔧
- AD calls are synchronous DirectoryEntry/DirectorySearcher operations wrapped in `Task.Run(...)` to keep async method signatures.
- Mapping and parsing live in `ActiveDirectoryService` (`MapToUserDto`, `MapToComputerDto`). Mapping exceptions are typically swallowed (returning `null`) — be careful when changing these mappings.
- Controllers follow a consistent error contract: return `BadRequest`, `NotFound`, or `StatusCode(500, new { error, message })` and **log** exceptions with ILogger.

## Important implementation details & gotchas 🧠
- Title <-> Description mirroring: when updating user attributes, **Title** is mirrored into **Description** if provided. Both backend and frontend implement this behavior; keep them in sync when changing update logic.
- Manager resolution: `UpdateUserAttributesByUserPrincipalNameAsync` accepts manager identifiers as UPN, sAMAccountName, or DisplayName. It resolves UPN/sAMAccountName first, then attempts an **exact** displayName match and will throw on ambiguous results.
- Unlocking users: `UnlockAllLockedUsersAsync` tries `de.Invoke("UnlockAccount")` then falls back to clearing `lockoutTime` if needed; returned `UnlockResultDto` contains `unlocked` and `failed` lists.
- Device numbering: `GetLastDeviceNumbersAsync` expects computer names matching regex `^([A-Z]+)(\d+)([A-Z]*)$` and only considers prefixes `SDLL`, `SDLD`, `DBOL`.
- Computer description endpoints:
  - `PUT /api/computers/{computerName}/description` expects a JSON string body (e.g., `"New description"`).
  - `PATCH /api/computers/{computerName}/description` accepts `{ "description": "..." }` and returns the updated `ComputerDto`.
- Search computers uses a combined LDAP filter that checks both `name` and `description`, so use the single `/api/computers/search` endpoint for both purposes.

## Typical developer workflows (commands) ▶️
- API (root):
  - Restore: `dotnet restore`
  - Run: `dotnet run` (API listens on `http://localhost:5001` per `Program.cs`)
- Frontend (in `MIS/`):
  - Install: `npm install`
  - Serve: `ng serve` (open `http://localhost:4200`)
  - Tests: `ng test` (Vitest as configured)
- Debugging: run API locally and use Swagger to exercise endpoints; point the Angular app to the API URL in `MIS/src/app/services/api.ts`.

## Testing & safety notes 🧪
- There are no AD integration tests in the repo. For unit tests, **mock `IActiveDirectoryService`** rather than testing with real AD unless you have a dedicated test AD environment.
- If adding integration tests that touch AD, isolate/recreate a dedicated test environment (domain-joined VM) and never run destructive operations against production AD.

## How an AI agent should contribute 🤖
- Small, focused PRs with a short description and a single area of change (e.g., "Refactor AD mapping for manager string parsing").
- When changing AD logic, extract pure parsing/formatting logic into small static helpers and add unit tests; keep LDAP calls in `ActiveDirectoryService` thin.
- When adding endpoints, follow existing error patterns and DTO usage in `Models/`.

## Quick examples (copy/paste) 📋
- Get user: `GET http://localhost:5001/api/users/john.doe`
- Search computers: `GET http://localhost:5001/api/computers/search?searchTerm=PC01`
- Update description (client example in `MIS/src/app/services/api.ts`):
  - `PUT http://localhost:5001/api/computers/PC01/description` body: `"New description"` (Content-Type: application/json)

---
If anything above is unclear or you'd like a different level of detail (e.g., a test scaffolding example or a small sample integration test), tell me which part to expand and I will iterate. ✅