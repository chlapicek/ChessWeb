# ChessWeb Documentation

Welcome to the **ChessWeb Platform** documentation. ChessWeb is a full-stack chess web portal built with **ASP.NET Core (.NET 10)** on the backend and **React (TypeScript + Vite + Tailwind CSS)** on the frontend.

---

## 1. Architecture Overview

```
ChessWeb/
├── src/
│   ├── backend/               # ASP.NET Core (.NET 10) REST API
│   │   ├── Controllers/       # REST Endpoints (Auth, Articles, Forums, Calendar, Competitions)
│   │   ├── Data/              # ApplicationDbContext & Data Seeding
│   │   ├── Domain/            # Entities (Article, Forum, Competition, User, Role)
│   │   ├── DTOs/              # Request/Response contracts
│   │   ├── Services/          # JWT auth, Local file storage, iCal/RSS Sync engine
│   │   └── Validators/        # FluentValidation rules (lengths, sizes)
│   └── frontend/              # React 18 + TypeScript + Vite + Tailwind CSS
│       ├── src/
│       │   ├── components/    # Interactive ChessViewer (chess.js + react-chessboard), FileUpload, Navbar, AuthModal
│       │   ├── context/       # AuthContext & RBAC state
│       │   ├── views/         # ArticlesView, ForumsView, CalendarView, CompetitionsView, AdminView
│       │   └── services/      # Axios API client with JWT interceptor
└── tests/
    └── backend/               # xUnit unit tests & WebApplicationFactory API integration tests
```

---

## 2. Key Features & Business Rules

### 1. User Roles & Permission Model
- **Anonymous Users**: Can browse and read public articles, forum discussions, competition overviews, and public calendar events.
- **Registered Users**: Can publish articles and forum topics/replies, upload attachments within quotas.
- **Hosting Players**: Special registered role with exclusive access to venue logistics, hall entry key notes, and organizer contact details.
- **Root Players**: Special registered role with access to team board lineups, tactical preparation against opponent repertoires, and captain memos.
- **Administrators**: Full system rights, ability to delete any post/article, change user roles, manage external iCal/RSS calendar sync feeds.

### 2. Length & Attachment Size Quotas
- **Articles**: Max 30,000 characters. Up to 3 attachments per article (max 5 MB per file: JPG, PNG, GIF, WebP, PDF, PGN, or TXT).
- **Forum Topics / Posts**: Max 15,000 / 10,000 characters. Up to 3 attachments (max 5 MB per file).
- **Enforcement**: Validated on both client side and backend (`FluentValidation` + the configured file-storage service).

### Attachment Storage
- `FileStorage:Provider` selects `Local` or `S3`; local disk remains the default for direct development.
- S3-compatible storage uses `FileStorage:S3:Endpoint`, `AccessKey`, `SecretKey`, `Bucket`, `Region`, and `UsePathStyle`. Keep buckets private and provide credentials through environment variables or a secret manager.
- Docker Compose selects `Local` storage and mounts the Docker-managed `backend-uploads` named volume at `/var/lib/chessweb/uploads`. The API streams downloads, so attachment files are never exposed as a public static directory. `docker compose down -v` deletes the volume and its contents; back it up separately for production data.
- Storage keys are generated GUIDs with the validated extension; the original filename is retained as metadata and in the attachment record. No malware scanner is included.
- When changing from S3 to local storage, existing S3 objects must be copied into the named volume and verified before switching the provider; the application does not migrate them automatically.

### 3. Interactive Chessboard & PGN Viewer
- Articles and forum posts can embed PGN or FEN games.
- Interactive playback controls: First, Previous, Next, Last, Flip board, and move timeline buttons.

### 4. Event Calendar & Recurrence Engine
- External calendar feeds support both **iCalendar (`.ics`)** and **RSS feeds**.
- Automatic categorization of events (Tournaments, League Matches, Club Nights, Seminars).
- **Recurring Events**: Support for recurring schedules (Daily, Weekly, Bi-Weekly, Monthly) with occurrence limits or until-dates, linked by `RecurrenceGroupId`.
- Granular deletion options: Delete single occurrence vs. delete entire recurring series.

### 5. Internationalization, Pagination & Theme Support
- Full Czech (`cs`) and English (`en`) localization with persistent state.
- Light and Dark mode theme switcher with persistence in `localStorage`.
- **Reusable Pagination Component**: Integrated into Articles (5/page), Forum Topics (8/page), Forum Thread Replies (10/page), and Admin Member Management (5/page) for responsive navigation.

---

## 3. Getting Started

### Local Development

#### Backend (.NET 10):
```bash
cd src/backend
dotnet run
```
API endpoints available at `http://localhost:8080/api`.

#### Frontend (Vite):
```bash
cd src/frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:3000`.

### Running Tests

#### Backend Tests (Unit + Integration):
```bash
dotnet test tests/backend/ChessWeb.Tests.csproj
```

#### Frontend Tests (Vitest + Testing Library):
```bash
cd src/frontend
npx vitest run --config vitest.config.ts
```

### Pre-seeded Demo Credentials
- **Admin**: `admin@chessweb.local` / `Admin123!#`
- **Root Player**: `rootplayer@chessweb.local` / `Player123!#`
- **Hosting Player**: `hostplayer@chessweb.local` / `Player123!#`
