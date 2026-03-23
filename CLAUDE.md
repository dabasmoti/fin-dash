# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

fin-dash is a personal finance dashboard for Israeli bank accounts and credit cards. The system is split into two parts:

- **Local Mac** — scrapes banks daily via Puppeteer (banks block cloud IPs), uploads SQLite DB to Cloud Run
- **Cloud Run** — serves the React dashboard, reads data from DB (no scraping), persists DB to GCS

## Commands

```bash
# Install all dependencies
npm install && cd server && npm install && cd ..

# Development (frontend + backend concurrently)
npm run dev

# Frontend only (Vite dev server on :5173)
npm run dev:client

# Backend only (tsx on :3005 — see .env SERVER_PORT)
npm run dev:server

# Build frontend
npm run build

# Build backend
cd server && npm run build

# Deploy to Cloud Run (auto on push to main, or manual)
gcloud builds submit --config=cloudbuild.yaml

# Run local scrape + upload to Cloud Run
~/fin-dash/scripts/scrape-and-upload.sh

# Check scrape logs
cat ~/fin-dash/scripts/scrape.log
```

## Architecture

**Two npm projects** sharing a root `.env` file:
- Root (`/`) — React frontend (Vite + TypeScript)
- `server/` — Express backend (TypeScript, compiled with tsc)

**Local development:**
```
Browser --> Vite (:5173) --proxy /api/*--> Express (:3005)
```

**Production (Cloud Run):**
```
Browser --> Cloud Run (Express serves both static SPA + API on :8080)
```

### Data Flow

**Local (scraping):**
1. macOS launchd cron runs `scripts/scrape-and-upload.sh` daily at 12:00
2. Starts temporary Express server on port 3099
3. Scrapes all banks via Puppeteer (home IP)
4. Saves to local SQLite
5. Uploads DB to Cloud Run via `POST /api/db/upload` (curl + AUTH_TOKEN)
6. Cloud Run saves DB to GCS bucket for cold start persistence

**Cloud Run (dashboard):**
1. On cold start, downloads DB from GCS bucket
2. Frontend calls `/api/data/all` to read from DB (no scraping)
3. Dashboard shows "Synced X ago" based on last scrape timestamp in DB

**Local dev (browser at localhost):**
1. Frontend detects `hostname === 'localhost'`
2. Calls `/api/scrape/all` instead — triggers live Puppeteer scrape
3. Bank credentials read from `.env`

### Frontend

- **React 18 + TypeScript** with strict mode, path alias `@` -> `./src`
- **Tailwind CSS v4** via Vite plugin (not PostCSS)
- **shadcn/ui** (new-york style) with Radix primitives in `src/components/ui/`
- **State management:** React Context only (DataContext, FilterContext, ThemeContext)
- **Routing:** React Router v7 with lazy-loaded pages, Suspense, and AuthGuard
- **Charts:** Recharts
- **Tables:** TanStack Table v8
- **Pages:** Login (`/login`), Dashboard (`/`), Transactions (`/transactions`), Analytics (`/analytics`)
- **Data routing:** `src/services/api-client.ts` — `localhost` uses `/api/scrape/all`, production uses `/api/data/all`

### Backend

- **Express 4** with TypeScript, compiled to `server/dist/`
- **SQLite** via better-sqlite3 (WAL mode, sync API)
- **Scraping:** israeli-bank-scrapers + Puppeteer (local only, disabled on Cloud Run via `SCHEDULER_ENABLED=false`)
- **GCS backup:** `server/src/services/gcs-backup.ts` — download on startup, upload after DB changes
- **DB upload:** `POST /api/db/upload` — accepts SQLite file from local cron script, validates magic bytes, saves to GCS
- **Auth:** Bearer token + HttpOnly cookie via `server/src/middleware/auth.ts`
- **Security:** Rate limiting, security headers (CSP, HSTS, X-Frame-Options), error sanitization in production
- **DB tables:** transactions, accounts, scrape_runs, recurring_patterns, category_rules

### API Routes

All routes in `server/src/routes/scraper.ts`:

| Endpoint | Description | Auth |
|----------|-------------|------|
| `GET /api/health` | Minimal public, full with auth | Public (limited) |
| `GET /api/data/all` | Read all bank data from DB | Required |
| `GET /api/scrape/all` | Live scrape (local dev only) | Required |
| `POST /api/db/upload` | Upload SQLite DB from local cron | Required |
| `GET /api/transactions` | Query with filters | Required |
| `GET /api/accounts` | Account list with balances | Required |
| `POST /api/scheduler/trigger` | Manual scrape trigger | Required |
| `GET /api/recurring-patterns` | Detected recurring transactions | Required |
| `GET /api/cashflow/projection` | Cash flow forecast | Required |
| `GET /api/category-rules` | User-defined categories | Required |
| `POST /api/auth/login` | Login with AUTH_TOKEN | Public |
| `GET /api/auth/check` | Check auth status | Public |
| `POST /api/auth/logout` | Clear auth cookie | Public |

## Key Patterns

- **Bank config:** `server/src/config/bank-registry.ts` maps bank IDs to scraper types. `server/src/config/credentials.ts` resolves credentials from `.env`. Frontend bank metadata in `src/constants/banks.ts`.
- **API client:** `src/services/api-client.ts` wraps fetch with `credentials: 'include'` and 401 handling. Auto-routes between scrape (local) and data (cloud) endpoints.
- **Auth flow:** `src/components/auth/AuthGuard.tsx` checks `/api/auth/check`, redirects to `/login` if unauthenticated. DataProvider and FilterProvider only mount inside AuthGuard.
- **Category classification:** `src/lib/category-classifier.ts` classifies transactions client-side.
- **Data utilities:** `src/lib/chart-utils.ts`, `src/lib/cashflow-utils.ts`, `src/lib/stacked-chart-utils.ts`.
- **Environment:** Backend reads `.env` from project root (`../../.env` relative to `server/src/`). Cloud Run uses Secret Manager for `AUTH_TOKEN` only — bank credentials stay local.

## GCP Infrastructure

- **Cloud Run:** Single service `fin-dash` in `me-west1`, min 0 / max 1 instances
- **Cloud Storage:** Bucket `fin-dash-dabas-data` for SQLite backup
- **Secret Manager:** `AUTH_TOKEN` only (bank credentials are local-only)
- **Artifact Registry:** Docker images in `me-west1`
- **Cloud Build:** Auto-deploy on push to `main` via GitHub trigger
- **Service accounts:** `fin-dash-run` (Cloud Run), `fin-dash-build` (CI/CD) — see `infra/README.md`

## No Tests

No test framework configured. No test files exist.
