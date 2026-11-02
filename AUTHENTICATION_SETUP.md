# Authentication setup

The API uses ASP.NET Core Identity with EF Core/SQLite for accounts and roles,
and JWT bearer tokens for API requests. Refresh tokens are stored as hashes,
rotated on use, and held in HttpOnly cookies. The access token is kept in
Angular memory only.

## Local development

Run these commands from the repository root in PowerShell:

```powershell
dotnet restore
dotnet tool install --global dotnet-ef --version 9.0.0
$key = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
dotnet user-secrets set "Authentication:SigningKey" $key --project .\ADApi.csproj
Remove-Variable key
dotnet run --project .\ADApi.csproj -- --migrate-auth
```

The signing key is generated locally and stored in .NET user-secrets, not in
the repository. Keep the key stable across restarts. In production, provide
`Authentication:SigningKey` through the deployment secret store or a protected
environment variable (`Authentication__SigningKey`) instead.

The default SQLite file is:

```text
%LOCALAPPDATA%\ADApi\auth.db
```

Set `Authentication__DatabasePath` to a persistent, backed-up location when
deploying as a Windows service or under a dedicated service identity. Ensure
the service identity can read and write the containing directory. The database
file and its WAL files are ignored by Git.

## Create the initial administrator

The application does not create an administrator automatically. After
configuring the signing key, run this once from an interactive terminal:

```powershell
dotnet run --project .\ADApi.csproj -- --bootstrap-admin admin
```

The bootstrap applies pending migrations, seeds the built-in roles and
component catalog, and prompts twice for an administrator password without
echoing it. It refuses to run if an account with that username already exists
or an administrator already exists. The password is processed by Identity and
only its password hash is stored. The configured minimum is 8 characters and
also requires uppercase, lowercase, a digit, and a non-alphanumeric character.
Use a unique password; longer passphrases are strongly recommended.

After setup, start the API normally:

```powershell
dotnet run --project .\ADApi.csproj
```

Sign in at `/login`. Use the Administration link to create local application
users and assign roles. New accounts default to `RestrictedUser` only when
selected by the administrator; no account or password is seeded automatically.
Use individual component overrides for restricted accounts. The four intended
FullAccess users and the restricted user must be added by an administrator;
their account names are not embedded in code.

## Permission catalog

The catalog is seeded from existing frontend pages and API areas:

| Permission | Application area |
|---|---|
| `ADTools` | Active Directory user and computer tools |
| `DeviceManagement` | Device and computer management |
| `NetworkDashboard` | Network, monitoring, and network dashboard |
| `Inventory` | Inventory |
| `Kiosk` | Digital signage management |
| `Printer` | Printer and label operations |
| `Forms` | Jobsheet and document/form workflows |
| `MailboxQuota` | Mailbox storage notifications |
| `WeekPlanner` | Weekly planner |
| `Files` | SMB file browser |
| `Alerts` | Alert messaging |
| `ImportantLinks` | Important links |
| `OtherTools` | Other utilities |
| `CamMicSpeaker` | Camera, microphone, and speaker tests |
| `DisplayTest` | Display tests |

`Admin` bypasses component grants for protected application functions.
`Manager` and `FullAccess` receive full normal-component grants when first
seeded. `RestrictedUser` receives no grants by default. An explicit user
permission overrides that user's role grants; `None` is an explicit denial.
Removing the user override restores inherited role access. API checks use
current database state, so changes apply on the next request.

## Public access and digital signage

No page or API is anonymous. The existing displayboard's polling endpoints are
protected with the rest of the APIs. Its standalone client currently has no
login/device-authentication flow, so it will no longer be able to retrieve
display content or post heartbeats until a separate device-auth integration is
approved and implemented. Static displayboard files are not authentication
boundaries; do not place secrets in them.

By explicit compatibility choice, files copied from `MIS/public` remain
directly downloadable without login. This includes operational data and
documents as well as UI assets. Angular route guards do not protect these
files; do not treat them as confidential. To protect any of them later, move
them out of the public asset pipeline and serve them through authenticated,
permission-checked API endpoints.

## Deployment notes

- Configure the exact Angular origins in the existing CORS policy; do not add
  arbitrary origins when credentials are enabled.
- Serve the application over HTTPS in production. Refresh cookies are marked
  Secure outside Development and use HttpOnly/SameSite protections; refresh
  and logout also require the CSRF header.
- Back up the SQLite file and signing key together. Losing the signing key
  invalidates access tokens. Rotate keys deliberately and plan for active
  sessions to reauthenticate.
- Do not commit credentials, user secrets, refresh tokens, or the database.
