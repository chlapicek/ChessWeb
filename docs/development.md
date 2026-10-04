# Development Guide

## Prerequisites

- .NET 10 SDK.
- Node.js 22.22.2 or later Node 24 supported by the frontend's `engines` declaration, plus npm.
- Git. Docker Desktop with Compose is optional for containerized development.

The frontend uses `npm ci --legacy-peer-deps`, matching CI and the Dockerfiles. The package lockfile should be kept in sync with `package.json`.

## Run Locally

The simplest local setup runs the API with SQLite and Vite in two terminals. Set the backend URL explicitly to `8080`, which is the Vite proxy's default target.

PowerShell, terminal 1:

```powershell
cd src/backend
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet run --urls http://localhost:8080
```

PowerShell, terminal 2:

```powershell
cd src/frontend
npm ci --legacy-peer-deps
npm run dev
```

Open <http://localhost:3000>. The Vite server proxies `/api` to `http://localhost:8080`; override this with `VITE_API_PROXY_TARGET` when the API listens elsewhere.

The Visual Studio launch profile in `src/backend/Properties/launchSettings.json` uses `https://localhost:61904` and `http://localhost:61905`. If you run the API on those ports instead, set `VITE_API_PROXY_TARGET` to the chosen URL before starting Vite.

### Local database and development data

`appsettings.Development.json` sets `UseSqlite=true`, disables ClamAV, enables sample-data seeding, and provides development-only values. The SQLite file is created under the running backend application's output directory at `App_Data/chessweb.db` (for example, under `bin/Debug/net10.0`). Startup initializes the schema and then seeds demo users/content. The seeder refuses to run when `SeedDemoData=true` outside Development.

Development seeding creates `admin@chessweb.local`, `superadmin@chessweb.local`, and sample player accounts such as `anna.novakova@chessweb.local`. `ResetDemoAdminPassword=true` resets their passwords on startup. These accounts are only for local Development; their passwords are deliberately not included in this guide and must never be carried into a deployed environment.

## Configuration

ASP.NET Core loads `appsettings.json`, the environment-specific appsettings file, environment variables, and command-line values. Use double underscores for environment-variable nesting, for example `Jwt__Key` for `Jwt:Key`.

| Setting | Purpose |
| --- | --- |
| `Jwt:Key` | Required signing key of at least 32 UTF-8 bytes; set a private strong value outside local Development. |
| `Jwt:Issuer`, `Jwt:Audience` | JWT validation values. |
| `Jwt:DurationInMinutes` | JWT lifetime from 60 through 120 minutes; defaults to 60 minutes. |
| `AuthRateLimit:LoginPermitsPerMinute`, `RegistrationPermitsPerMinute` | Login/registration requests allowed per normalized remote IP per minute; defaults are 5 and 3. Development appsettings overrides both to 1,000. |
| `UseSqlite` | Select SQLite when true; otherwise use `ConnectionStrings:DefaultConnection`. If not explicitly set, an empty SQL Server connection selects SQLite. |
| `ConnectionStrings:DefaultConnection` | SQL Server connection string when SQLite is disabled. |
| `Cors:AllowedOrigins` | Trusted browser origins allowed by the API. |
| `FileStorage:Provider`, `FileStorage:BasePath` | Only `Local` storage is supported; controls the upload directory. |
| `ClamAv:Enabled`, `Host`, `Port`, `TimeoutSeconds`, `RescanIntervalHours` | Scanner setup and attachment rescanning. |
| `Uploads:RateLimitPerMinute` | Per-user/client upload request limit. |
| `SeedDemoData`, `ResetDemoAdminPassword` | Development-only sample data and password reset behavior. |
| `Logging:RetainedFileCountLimit` | Number of rolling log files retained. |

The API fails at startup if `Jwt:Key` is empty or shorter than 32 UTF-8 bytes, if the configured token lifetime is outside 60-120 minutes, if an auth rate limit is below 1, or if a non-Local file storage provider is configured. Passwords must be at least 15 characters. Do not commit secrets to appsettings or `.env` files.

## Build and Test

From the repository root:

```powershell
dotnet restore ChessWeb.slnx
dotnet build ChessWeb.slnx
dotnet test tests/backend/ChessWeb.Tests.csproj
```

The backend test project uses xUnit and `WebApplicationFactory` for API integration tests.

From `src/frontend`:

```powershell
npm ci --legacy-peer-deps
npm run typecheck
npm run test:run
npm run build
```

`npm run build` runs the typecheck before Vite builds production assets. `npx vitest run` is an equivalent one-off test command; `npm run test:coverage` enables coverage.

### End-to-end tests

Playwright starts a Vite server on `http://127.0.0.1:4173`. Run the backend separately first. `API_BASE_URL` configures the Vite proxy target for the Playwright server:

```powershell
$env:API_BASE_URL = "http://localhost:8080"
npm run e2e
```

For a visible browser, run `npm run e2e:headed`. Some API-dependent scenarios are skipped without a configured backend. Set `E2E_ALLOW_MUTATING_API=1` only when intentionally running mutating API scenarios; this limits Playwright to one worker.

## CI

`.github/workflows/ci.yml` runs on pushes to `main`, pull requests, a scheduled daily build, and manual dispatch. The backend job installs .NET 10, restores dependencies, checks NuGet advisories, builds the test project, then runs its tests. The frontend job uses Node 22.22.2, `npm ci --legacy-peer-deps`, checks npm advisories, runs `npm run test:run`, and builds. CI also verifies development Compose ports bind to loopback. CI does not run the Playwright end-to-end suite.

## Docker Development

For the hot-reload stack:

```powershell
docker compose -f docker-compose.dev.yml up --build
```

The frontend is available at `http://127.0.0.1:3001` by default (`FRONTEND_PORT` changes the host port). The API is published on port 8080 and SQL Server on 1433, both bound to `127.0.0.1`. This profile uses SQL Server, enables demo seeding and ClamAV, and has development-only fallback secrets. Keep the host bindings loopback-only unless you intentionally secure and expose the development services. See [deployment.md](deployment.md) for the service and persistence details.