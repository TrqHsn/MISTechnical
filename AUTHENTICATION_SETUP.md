# Authentication setup

The API uses ASP.NET Core Identity with EF Core/SQLite for accounts and roles,
and JWT bearer tokens for API requests. Refresh tokens are stored as hashes,
rotated on use, and held in HttpOnly cookies. The access token is kept in
Angular memory only.

## Portable local setup

By default, authentication data is stored in `App_Data` beside the application:

```text
App_Data\auth.db
App_Data\auth-signing-key
```

On first start, the application generates a random signing key and saves it
beside the SQLite account database. If the previous default database exists at
`%LOCALAPPDATA%\ADApi\auth.db`, it is copied into `App_Data` on first start
without deleting the original. Existing .NET user-secrets or an
`Authentication__SigningKey` environment variable are retained and copied to
the portable key file when it is first created.

To carry the same accounts to another PC, stop the application and copy the
entire project/application folder, including `App_Data`. The database and key
must travel together. The destination must be able to write to `App_Data`.
Never commit or distribute this folder to untrusted users: it contains the
signing key and password hashes. Back it up securely.

Setting `Authentication__DatabasePath` overrides the portable database
location. Setting `Authentication__SigningKey` (or the environment variable
`Authentication__SigningKey`) overrides the key file; keep that secret stable
and transfer it separately if copying the application. For services or
deployments with separate data storage, configure both values through a
protected secret/configuration store.

## Create the initial administrator

The application does not create an administrator automatically. Run this
once from an interactive terminal:

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
- Configure the exact Angular origins in `Program.cs` for a new PC/network;
  credentialed CORS does not allow arbitrary origins.
- Do not commit credentials, user secrets, refresh tokens, or the database.
