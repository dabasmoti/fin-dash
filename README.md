# fin-dash

A personal finance dashboard for Israeli bank accounts and credit cards. Scrapes transaction data locally from your Mac, syncs to a cloud-hosted dashboard via GCP Cloud Run.

## How It Works

The system is split into two parts:

```
YOUR MAC (scraping)                         CLOUD RUN (dashboard)
---------------------                       ----------------------
Cron job runs daily                         Serves React dashboard
at 12:00 noon                               at https://....run.app
        |                                           |
        v                                           v
Starts local Express                        On cold start, downloads
server + Puppeteer                          SQLite DB from GCS bucket
        |                                           |
        v                                           v
Scrapes 4 Israeli banks                     Reads transactions from
using home IP (banks                        local DB via /api/data/all
block cloud IPs)                            (no scraping)
        |                                           |
        v                                           v
Saves transactions to                       Shows dashboard with
local SQLite DB                             charts, filters, analytics
        |                                           |
        v                                           v
Uploads DB to Cloud Run                     Auth via AUTH_TOKEN
via POST /api/db/upload                     (cookie + bearer token)
        |
        v
Cloud Run saves DB
to GCS bucket for
persistence across
cold starts
```

**Why the split?** Israeli banks block requests from cloud datacenter IPs. Scraping only works from a residential IP (your home network). The dashboard is hosted on Cloud Run for HTTPS access from anywhere.

## Supported Banks

| Bank | Type | Credentials |
|------|------|-------------|
| Beinleumi (First International) | Bank account | Username + Password |
| Max | Credit card | Username + Password |
| Isracard | Credit card | ID + Card6Digits + Password |
| Visa Cal | Credit card | Username + Password |

## Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts, TanStack Table

**Backend:** Express, israeli-bank-scrapers, Puppeteer, better-sqlite3, node-cron

**Infrastructure:** GCP Cloud Run, Cloud Storage, Secret Manager, Cloud Build, Artifact Registry

## Quick Start (Local Development)

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

Frontend: `http://localhost:5173` | Backend: `http://localhost:3001`

Locally, the frontend scrapes banks live via `/api/scrape/all`. No login required unless `AUTH_TOKEN` is set in `.env`.

## Cloud Run Deployment

### Prerequisites

- `gcloud` CLI installed and authenticated
- GCP project with billing enabled

### Setup (one-time)

```bash
# 1. Enable APIs and create resources
./infra/01-setup-project.sh

# 2. Create service accounts with least-privilege permissions
./infra/02-create-service-accounts.sh

# 3. Create AUTH_TOKEN secret (only secret needed in cloud)
./scripts/setup-secrets.sh

# 4. Set up Cloud Build trigger in console:
#    https://console.cloud.google.com/cloud-build/triggers/add
#    Source: dabasmoti/fin-dash, Branch: main, Config: cloudbuild.yaml
#    SA: fin-dash-build@fin-dash-dabas.iam.gserviceaccount.com

# 5. First deploy
gcloud builds submit --config=cloudbuild.yaml
```

### CI/CD

Push to `main` auto-deploys via Cloud Build trigger:
1. Builds combined Docker image (frontend + backend + Chromium)
2. Pushes to Artifact Registry
3. Deploys to Cloud Run with AUTH_TOKEN from Secret Manager

### Local Scraping Cron Job

Installed at `~/Library/LaunchAgents/com.fin-dash.scrape.plist`. Runs daily at 12:00 noon.

The script (`scripts/scrape-and-upload.sh`):
1. Starts a temporary local server on port 3099
2. Scrapes all 4 banks via Puppeteer
3. Uploads the SQLite DB to Cloud Run via `curl` (no gcloud auth needed)
4. Cloud Run saves the DB to GCS for cold start persistence

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

### Rotate AUTH_TOKEN

```bash
NEW_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo -n "$NEW_TOKEN" | gcloud secrets versions add AUTH_TOKEN --data-file=-
sed -i '' "s/AUTH_TOKEN=.*/AUTH_TOKEN=$NEW_TOKEN/" ~/fin-dash/.env
git push  # triggers redeploy
```

## Security

| Control | Where |
|---|---|
| Bank credentials in local `.env` only | Never in cloud, git, or Docker images |
| AUTH_TOKEN in Secret Manager | Injected into Cloud Run at startup |
| HTTPS enforced | Cloud Run auto-TLS on `*.run.app` |
| Security headers | CSP, HSTS, X-Frame-Options, X-Content-Type-Options |
| Auth on all API endpoints | Bearer token + HttpOnly/Secure/SameSite=Strict cookie |
| Timing-safe password comparison | Prevents brute force timing leaks |
| Rate limiting | 60 req/min per IP on all API routes, 5 login attempts per 15 min |
| DB upload validation | SQLite magic bytes check |
| Non-root container | Runs as `appuser` |
| Least-privilege SAs | `fin-dash-run` (secrets + GCS only), `fin-dash-build` (deploy only) |
| Error sanitization | Generic errors in production, full details only in dev |

## Service Accounts

| SA | Used By | Permissions |
|---|---|---|
| `fin-dash-run` | Cloud Run | `secretmanager.secretAccessor`, `storage.objectAdmin` (bucket only) |
| `fin-dash-build` | Cloud Build CI/CD | `artifactregistry.writer`, `run.admin`, `secretmanager.secretAccessor`, `logging.logWriter` |

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/health` | Minimal public, full details with auth | Public (limited) |
| GET | `/api/data/all` | Read all bank data from DB (no scraping) | Required |
| GET | `/api/scrape/all` | Live scrape all banks (local only) | Required |
| GET | `/api/scrape/:bankId` | Live scrape single bank | Required |
| POST | `/api/db/upload` | Upload SQLite DB file (from local cron) | Required |
| GET | `/api/transactions` | Query transactions with filters | Required |
| GET | `/api/accounts` | List accounts with balances | Required |
| POST | `/api/scheduler/trigger` | Trigger manual scrape | Required |
| POST | `/api/auth/login` | Login with AUTH_TOKEN | Public |
| GET | `/api/auth/check` | Check auth status | Public |
| POST | `/api/auth/logout` | Clear auth cookie | Public |

## Frontend Pages

- **Dashboard** `/` - Account balances, quick stats, recent transactions, spending charts, "Synced X ago" indicator
- **Transactions** `/transactions` - Searchable data table with column sorting, filters, and CSV export
- **Analytics** `/analytics` - Monthly trends, category breakdowns, top merchants, currency analysis, installment forecasts
- **Login** `/login` - Password-protected entry (Cloud Run only)

## Data Routing (Frontend)

The frontend automatically picks the right data source:

| Environment | `window.location.hostname` | Data endpoint | Behavior |
|---|---|---|---|
| Local dev | `localhost` | `/api/scrape/all` | Live scrape via Puppeteer |
| Cloud Run | `*.run.app` | `/api/data/all` | Read from SQLite DB |

## Project Structure

```
fin-dash/
├── src/                        # Frontend (React + TypeScript)
│   ├── pages/                  # Dashboard, Transactions, Analytics, Login
│   ├── components/             # UI components (dashboard, analytics, auth, shared)
│   ├── contexts/               # DataContext, FilterContext, ThemeContext
│   ├── services/               # API client (auto-routes local vs cloud)
│   ├── types/                  # TypeScript interfaces
│   └── constants/              # Bank and category definitions
├── server/                     # Backend (Express + TypeScript)
│   ├── src/
│   │   ├── routes/             # API endpoints (scraper, data, db upload)
│   │   ├── services/           # Scraper, scheduler, database, cache, GCS backup
│   │   ├── config/             # Credentials, bank registry
│   │   └── middleware/         # Auth, rate limiting, security headers, error handling
│   ├── data/                   # SQLite database (gitignored)
│   └── Dockerfile              # Local Docker build with Chromium
├── scripts/
│   ├── scrape-and-upload.sh    # Local cron: scrape + upload DB to Cloud Run
│   └── setup-secrets.sh        # Create AUTH_TOKEN in Secret Manager
├── infra/
│   ├── README.md               # GCP infra documentation
│   ├── 01-setup-project.sh     # Enable APIs, create AR repo + GCS bucket
│   └── 02-create-service-accounts.sh  # Create least-privilege SAs
├── Dockerfile.cloud            # Combined build for Cloud Run
├── cloudbuild.yaml             # CI/CD pipeline (GitHub push -> deploy)
├── docker-compose.yml          # Local Docker orchestration
└── nginx.conf                  # Local Docker reverse proxy
```

## Cost

| Service | Free Tier | Usage | Cost |
|---|---|---|---|
| Cloud Run | 180K vCPU-sec | ~500 vCPU-sec | $0.00 |
| Cloud Storage | 5 GB | <5 MB | $0.00 |
| Secret Manager | 6 versions | 1 secret | $0.00 |
| Artifact Registry | 500 MB | ~500 MB | $0.00 |
| Cloud Build | 120 min/day | ~8 min/deploy | $0.00 |
| **Total** | | | **$0.00/month** |

## License

Private project.
