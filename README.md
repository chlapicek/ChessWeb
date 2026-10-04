# ChessWeb

ChessWeb is a chess-club portal for articles and game analysis, player profiles, team availability, events, notifications, and partner listings. It is built with ASP.NET Core 10, Entity Framework Core, React 19, TypeScript, and Vite.

## Quick Start

Prerequisites: .NET 10 SDK, Node.js 22.22.2 or newer supported Node 24, and npm. The local backend uses SQLite in Development; the frontend proxies `/api` to `http://localhost:8080`.

Terminal 1, from the repository root:

```powershell
cd src/backend
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet run --urls http://localhost:8080
```

Terminal 2:

```powershell
cd src/frontend
npm ci --legacy-peer-deps
npm run dev
```

Open <http://localhost:3000>. Development seeds sample data and demo accounts. Account names and setup options are in the [development guide](docs/development.md); never use demo accounts or development secrets in a deployed environment.

## Build and Test

From the repository root:

```powershell
dotnet build ChessWeb.slnx
dotnet test tests/backend/ChessWeb.Tests.csproj
```

From `src/frontend`:

```powershell
npm run test:run
npm run build
```

The frontend build includes a TypeScript check. Playwright end-to-end tests and the exact CI workflow are documented in the [development guide](docs/development.md).

## Run with Docker Compose

Production Compose requires `MSSQL_SA_PASSWORD` and `JWT_SIGNING_KEY` in the environment. For PowerShell:

```powershell
$env:MSSQL_SA_PASSWORD = "<strong SQL Server password>"
$env:JWT_SIGNING_KEY = "<long random signing key>"
docker compose up --build -d
```

The frontend is published on `127.0.0.1:3000`; terminate TLS at a trusted reverse proxy before making the service reachable remotely. Compose uses persistent SQL Server and upload volumes and a ClamAV scanner. See the [deployment guide](docs/deployment.md) before operating a real installation.

## Documentation

- [Architecture, features, data model, and security](docs/architecture.md)
- [HTTP API reference](docs/api.md)
- [Local development, configuration, and tests](docs/development.md)
- [Docker Compose deployment and operations](docs/deployment.md)

## Project Status

The API currently exposes articles, calendar, game collections, logging settings, notifications, partners, players, teams, and team availability. The data model contains a Competition entity, but this checkout has no separate Forums or Competition API controller. See the [API reference](docs/api.md) for implemented routes rather than inferring endpoints from old feature notes. The TLS proxy must overwrite `X-Forwarded-For` and set `X-Forwarded-Proto`; Compose trusts only its frontend container and bridge gateway when deriving client addresses for authentication rate limits. Keep the backend private and configure equivalent explicit trusted-proxy addresses if the network topology changes.