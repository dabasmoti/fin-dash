# fin-dash

A full-stack personal finance dashboard for Israeli bank accounts and credit cards. Automatically scrapes transaction data from supported banks, stores it in SQLite, and presents it through an interactive React dashboard with charts, filters, and analytics.

## Supported Banks

| Bank | Type | Credentials |
|------|------|-------------|
| Beinleumi (First International) | Bank account | Username + Password |
| Max | Credit card | Username + Password |
| Isracard | Credit card | ID + Card6Digits + Password |

## Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts, TanStack Table

**Backend:** Express, israeli-bank-scrapers, Puppeteer, better-sqlite3, node-cron

**Infrastructure:** Docker, nginx, docker-compose, GCP Cloud Run, Cloud Storage, Secret Manager

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Local Development

```bash
# Install dependencies
npm install
cd server && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your bank credentials

# Start both frontend and backend
npm run dev
```

The frontend runs at `http://localhost:5173` and the backend at `http://localhost:3001`.

### Docker Deployment

```bash
# Configure environment
cp .env.example .env
# Edit .env with your bank credentials

# Build and start
docker compose up --build -d
```

The app is served at `http://localhost` (port 80). The backend API is reverse-proxied through nginx at `/api/`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `3001` | Backend server port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Frontend origin for CORS |
| `SCRAPE_INTERVAL_MINUTES` | `30` | Auto-scrape interval in minutes |
| `SCHEDULER_ENABLED` | `true` | Enable/disable automatic scraping |
| `SCRAPER_TIMEOUT_MS` | `120000` | Puppeteer timeout per scrape (ms) |
| `CACHE_TTL_MS` | `300000` | In-memory cache TTL (ms) |
| `DB_PATH` | `server/data/fin-dash.db` | SQLite database file path |
| `PUPPETEER_EXECUTABLE_PATH` | _(empty)_ | Path to Chromium binary (auto-set in Docker) |
| `AUTH_TOKEN` | _(empty)_ | Dashboard login password. Leave empty to disable auth (local dev) |
| `GCS_BUCKET` | _(empty)_ | GCS bucket for SQLite backup. Leave empty to disable (local dev) |

Bank credentials are configured per provider. See `.env.example` for the full list.

## Architecture

```
Browser --> nginx (port 80)
              |
              |--> /api/* --> Express backend (port 3001)
              |--> /*     --> React SPA (static files)

Express backend
  ├── Scraper Service    (israeli-bank-scrapers + Puppeteer)
  ├── Scheduler Service  (node-cron, configurable interval)
  ├── Database Service   (SQLite with WAL mode)
  └── Cache Service      (in-memory TTL cache)
```

### Data Flow

1. **Scheduled scraping** - node-cron triggers `scrapeAllBanks()` every N minutes
2. **On-demand scraping** - API calls trigger individual or bulk scrapes
3. **Persistence** - Scraped transactions are upserted into SQLite (deduplication via composite key)
4. **Caching** - Recent scrape results are cached in-memory to avoid redundant scrapes
5. **Frontend** - React app fetches data via `/api/*` endpoints and renders dashboards

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check with scheduler status and DB stats |
| GET | `/api/scrape/all` | Scrape all configured banks |
| GET | `/api/scrape/:bankId` | Scrape a single bank |
| GET | `/api/cache/clear` | Clear in-memory scrape cache |
| GET | `/api/scheduler/status` | Current scheduler state |
| POST | `/api/scheduler/trigger` | Manually trigger a scheduled scrape |
| GET | `/api/transactions` | Query stored transactions (supports filters) |
| GET | `/api/accounts` | List all accounts with balances |
| GET | `/api/scrape-history` | Scrape run history |

### Transaction Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `bankId` | string | Filter by bank ID |
| `from` | ISO date | Start date |
| `to` | ISO date | End date |
| `status` | string | Transaction status |
| `category` | string | Transaction category |
| `limit` | number | Max results (default: 100) |
| `offset` | number | Pagination offset |

## Frontend Pages

- **Dashboard** - Account balances, quick stats, recent transactions, spending charts
- **Transactions** - Searchable data table with column sorting, filters, and CSV export
- **Analytics** - Monthly trends, category breakdowns, top merchants, currency analysis, installment forecasts

## Project Structure

```
fin-dash/
├── src/                        # Frontend
│   ├── pages/                  # Dashboard, Transactions, Analytics, Login
│   ├── components/             # UI components (dashboard, analytics, auth, shared)
│   ├── contexts/               # DataContext, FilterContext, ThemeContext
│   ├── services/               # API client
│   ├── types/                  # TypeScript interfaces
│   └── constants/              # Bank and category definitions
├── server/                     # Backend
│   ├── src/
│   │   ├── routes/             # Express route handlers
│   │   ├── services/           # Scraper, scheduler, database, cache, GCS backup
│   │   ├── config/             # Credentials, bank registry
│   │   └── middleware/         # Auth, error handling
│   ├── data/                   # SQLite database (gitignored)
│   └── Dockerfile              # Multi-stage build with Chromium
├── scripts/                    # Deployment and scraping scripts
│   ├── setup-secrets.sh        # Create GCP secrets from .env
│   └── scrape-and-upload.sh    # Local scrape + GCS upload (cron)
├── Dockerfile.cloud            # Combined frontend+backend for Cloud Run
├── cloudbuild.yaml             # Cloud Build CI/CD pipeline
├── docker-compose.yml          # Local Docker orchestration
├── Dockerfile                  # Frontend multi-stage build (local Docker)
└── nginx.conf                  # Reverse proxy + SPA routing (local Docker)
```

## GCP Cloud Run Deployment

The app is deployed as a single Cloud Run service (frontend + backend in one container). Scraping runs locally on your Mac because Israeli banks block cloud datacenter IPs. A macOS launchd job scrapes every 6 hours and uploads the SQLite DB to Cloud Storage. Cloud Run downloads the latest DB on each cold start.

### Architecture

```
Your Mac (local scraping)
  ├── launchd runs scrape-and-upload.sh every 6h
  ├── Scrapes all banks via Puppeteer (home IP)
  └── Uploads SQLite DB to Cloud Storage

Cloud Run (dashboard only)
  ├── Downloads DB from Cloud Storage on startup
  ├── Serves React SPA + API
  ├── Auth via AUTH_TOKEN (bearer token / cookie)
  └── HTTPS automatic via *.run.app domain
```

### Initial Setup

Prerequisites: `gcloud` CLI authenticated, a GCP project with billing enabled.

```bash
# 1. Enable APIs
gcloud services enable run.googleapis.com secretmanager.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com

# 2. Create infra
gcloud artifacts repositories create fin-dash --repository-format=docker --location=me-west1
gcloud storage buckets create gs://YOUR-BUCKET-NAME --location=me-west1 --uniform-bucket-level-access

# 3. Create secrets from .env (reads credentials, generates AUTH_TOKEN)
./scripts/setup-secrets.sh

# 4. Build and deploy
gcloud builds submit --config=cloudbuild.yaml
```

### Security

- Bank credentials stored in GCP Secret Manager (never in files, images, or git)
- HTTPS enforced automatically by Cloud Run
- All API endpoints protected by AUTH_TOKEN (bearer token + HttpOnly cookie)
- Login uses timing-safe comparison to prevent brute force timing leaks
- Rate limiting on login endpoint (5 attempts per 15 minutes)
- Non-root container user
- SQLite encrypted at rest via GCS server-side encryption

### Local Scraping Cron Job

The macOS launchd job is installed at `~/Library/LaunchAgents/com.fin-dash.scrape.plist` and runs the scrape script at 00:00, 06:00, 12:00, 18:00 daily.

```bash
# Check logs
cat ~/fin-dash/scripts/scrape.log

# Run manually
~/fin-dash/scripts/scrape-and-upload.sh

# Stop the cron job
launchctl unload ~/Library/LaunchAgents/com.fin-dash.scrape.plist

# Restart the cron job
launchctl load ~/Library/LaunchAgents/com.fin-dash.scrape.plist
```

### Redeploying

```bash
gcloud builds submit --config=cloudbuild.yaml
```

### Cost

Under $0.50/month. Cloud Run free tier covers compute. Only Secret Manager overage (~$0.24/month for 10 secrets vs 6 free).

## Docker Details (Local)

**Backend image** - Multi-stage build on `node:20-slim`. Runtime stage installs system Chromium and dependencies for Puppeteer. Runs as non-root `appuser`. Includes a healthcheck against `/api/health`.

**Frontend image** - Multi-stage build. Vite produces static assets, served by `nginx:1.25-alpine`. nginx handles SPA routing and proxies `/api/` to the backend with a 300s timeout for long-running scrapes.

**Data persistence** - SQLite database is stored in `./server/data/` and mounted as a Docker volume at `/app/data`.

## Scripts

```bash
# Development
npm run dev              # Start frontend + backend concurrently
npm run dev:client       # Frontend only (Vite)
npm run dev:server       # Backend only (tsx)

# Build
npm run build            # TypeScript check + Vite production build
cd server && npm run build  # Compile backend TypeScript

# Docker
docker compose up --build -d   # Build and start all services
docker compose down             # Stop all services
docker compose logs -f backend  # Tail backend logs
```

## License

Private project.
