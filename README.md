# ♟ ChessWeb

Full-stack chess web portal built with **ASP.NET Core (.NET 10)** and **React (TypeScript + Vite + Tailwind CSS)**.

## Features
- 📰 **Articles & Game Analysis**: Public browsing with rich content, comments, reactions (👍, ❤️, ♟️, 💡, 🏆), owner editing, attachments, and embedded interactive chessboard (PGN/FEN).
- 💬 **Community Forums**: Categorized discussions and game reviews with PGN embeds.
- 📅 **Event Calendar**: Full month interactive grid & list view, recurring events (Daily, Weekly, Bi-Weekly, Monthly), and external iCalendar (`.ics`) / RSS synchronization.
- 🏆 **Competitions Portal**:
  - **Hosting Player Role**: Private venue logistics, hall access instructions, organizer contacts.
  - **Root Player Role**: Private match board lineups, opponent tactical preparation, and captain memos.
  - **Admin Role**: Global content moderation, user role promotion, and feed management.
- 🌐 **Internationalization (i18n)**: Full support for Czech (`cs`) and English (`en`).
- 🌓 **Theme Support**: Seamless Light and Dark mode switching.
- 🧪 **Full Test Coverage**: xUnit API integration tests & Vitest UI tests.

## Running the Application

### 1. Run with Docker Compose
Set the production database and JWT signing secrets before starting Compose:
```bash
export MSSQL_SA_PASSWORD='replace-with-a-strong-password'
export JWT_SIGNING_KEY='replace-with-a-long-random-key'
docker-compose up --build
```

For local development with dummy defaults and hot reload, use `docker-compose.dev.yml` instead.
Docker Compose stores attachments through `LocalFileStorageService` in the Docker-managed `backend-uploads` named volume, mounted at `/var/lib/chessweb/uploads`. The API streams downloads rather than exposing the volume as a public directory. The volume survives container replacement, but `docker compose down -v` permanently deletes its contents; back it up separately for production data.

Every upload is re-encoded or content-checked and scanned by the `clamav` Compose service before it is stored. The ClamAV container needs roughly 1.5–3 GB of RAM and a few minutes on first start to download its signature database; until it is ready, uploads are refused with 503 rather than accepted unscanned.

### 2. Run Locally

#### Backend:
```bash
cd src/backend
dotnet run
```

#### Frontend:
```bash
cd src/frontend
npm install
npm run dev
```

### 3. Run Test Suites
```bash
# Backend tests (xUnit & WebApplicationFactory)
dotnet test tests/backend/ChessWeb.Tests.csproj

# Frontend tests (Vitest)
cd src/frontend
npx vitest run --config vitest.config.ts
```

For detailed architecture details, check [docs/architecture.md](docs/architecture.md).