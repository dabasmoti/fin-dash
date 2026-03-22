# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

fin-dash is a full-stack personal finance dashboard for Israeli bank accounts and credit cards. It scrapes transaction data via Puppeteer + israeli-bank-scrapers, stores it in SQLite, and presents interactive analytics through a React SPA.

## Commands

```bash
# Install all dependencies (both frontend and backend)
npm install && cd server && npm install && cd ..

# Development (runs frontend + backend concurrently)
npm run dev

# Frontend only (Vite dev server on :5173)
npm run dev:client

# Backend only (tsx watch on :3001)
npm run dev:server

# Build frontend (TypeScript check + Vite production build)
npm run build

# Build backend
cd server && npm run build

# Lint
npm run lint

# Docker
docker compose up --build -d
docker compose down
```

## Architecture

**Two separate npm projects** sharing a root `.env` file:
- Root (`/`) - React frontend (Vite + TypeScript)
- `server/` - Express backend (TypeScript, compiled with tsc)

**Runtime topology:**
```
Browser --> Vite dev server (:5173) --proxy /api/*--> Express (:3001)
```
In production, nginx replaces Vite as the static server and reverse proxy.

**Vite proxy note:** `vite.config.ts` proxies `/api` to port 3005, but the server defaults to port 3001. Set `SERVER_PORT=3005` in `.env` or update the proxy target to match.

### Frontend

- **React 18 + TypeScript** with strict mode, path alias `@` -> `./src`
- **Tailwind CSS v4** via Vite plugin (not PostCSS)
- **shadcn/ui** (new-york style) with Radix primitives in `src/components/ui/`
- **State management:** React Context only (DataContext, FilterContext, ThemeContext) - no Redux/Zustand
- **Routing:** React Router v7 with lazy-loaded pages and Suspense
- **Charts:** Recharts
- **Tables:** TanStack Table v8
- **Pages:** Dashboard (`/`), Transactions (`/transactions`), Analytics (`/analytics`)

### Backend

- **Express 4** with TypeScript, compiled to `server/dist/`
- **SQLite** via better-sqlite3 (WAL mode, sync API)
- **Scraping:** israeli-bank-scrapers + Puppeteer with configurable timeout (default 120s)
- **Scheduling:** node-cron for automatic scraping (default every 30 min)
- **Caching:** In-memory TTL cache (default 5 min) to avoid redundant scrapes
- **DB tables:** transactions, accounts, scrape_runs, recurring_patterns, category_rules
- **Deduplication:** Composite key (bankId, accountNumber, date, description, amount)

### API Routes

All routes are defined in `server/src/routes/scraper.ts`. Key endpoints:
- `GET /api/health` - health check with scheduler/DB stats
- `GET /api/scrape/all` and `GET /api/scrape/:bankId` - trigger scraping
- `GET /api/transactions` - query with filters (bankId, from, to, status, category, limit, offset)
- `GET /api/accounts` - account list with balances
- `GET /api/recurring-patterns` - detected recurring transactions
- `GET /api/cashflow-projection` - 30-day cash flow forecast
- `GET /api/category-rules` - user-defined transaction categories

## Key Patterns

- **Bank configuration:** `server/src/config/bank-registry.ts` maps bank IDs to scraper types and env var names. `server/src/config/credentials.ts` resolves credentials from `.env`. Frontend bank metadata (colors, labels) lives in `src/constants/banks.ts`.
- **API client:** `src/services/api-client.ts` wraps fetch for all backend calls. DataContext consumes it.
- **Category classification:** `src/lib/category-classifier.ts` classifies transactions client-side using rules from the backend.
- **Data utilities:** Chart aggregation in `src/lib/chart-utils.ts`, cash flow in `src/lib/cashflow-utils.ts`, stacked charts in `src/lib/stacked-chart-utils.ts`.
- **Environment:** The backend reads `.env` from the project root (`../../.env` relative to `server/src/`). See `.env.example` for all variables.

## No Tests

There is currently no test framework configured. No test files exist in the codebase.
