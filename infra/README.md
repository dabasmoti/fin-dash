# Infrastructure Setup

All GCP infrastructure for fin-dash. Run these scripts once during initial setup.

## Prerequisites

- `gcloud` CLI installed and authenticated (`gcloud auth login`)
- GCP project `fin-dash-dabas` with billing enabled
- GitHub repo connected to Cloud Build

## Setup Order

```bash
# 1. Enable APIs and create resources
./infra/01-setup-project.sh

# 2. Create secrets from .env
./scripts/setup-secrets.sh

# 3. Create service accounts with least-privilege permissions
./infra/02-create-service-accounts.sh

# 4. First deploy (or push to main for auto-deploy)
gcloud builds submit --config=cloudbuild.yaml
```

## Service Accounts

| SA | Purpose | Permissions |
|---|---|---|
| `fin-dash-run@` | Cloud Run runtime | `secretmanager.secretAccessor`, `storage.objectAdmin` (bucket only) |
| `fin-dash-build@` | Cloud Build CI/CD trigger | `artifactregistry.writer`, `run.admin`, `secretmanager.secretAccessor`, `logging.logWriter`, `iam.serviceAccountUser` on fin-dash-run |
| `781608208002-compute@` | Default (unused) | `roles/editor` (GCP default, not used by our services) |

## GCP Resources

| Resource | Name | Region | Purpose |
|---|---|---|---|
| Cloud Run service | `fin-dash` | `me-west1` | Dashboard + API |
| Artifact Registry | `fin-dash` | `me-west1` | Docker images |
| Cloud Storage bucket | `fin-dash-dabas-data` | `me-west1` | SQLite DB backup |
| Secret Manager | 10 secrets | global | Bank credentials + AUTH_TOKEN |

## Secrets in Secret Manager

| Secret | Source |
|---|---|
| `AUTH_TOKEN` | Dashboard login password (auto-generated) |
| `BEINLEUMI_USERNAME` | Bank credential |
| `BEINLEUMI_PASSWORD` | Bank credential |
| `MAX_USERNAME` | Bank credential |
| `MAX_PASSWORD` | Bank credential |
| `ISRACARD_ID` | Bank credential |
| `ISRACARD_CARD6DIGITS` | Bank credential |
| `ISRACARD_PASSWORD` | Bank credential |
| `VISACAL_USERNAME` | Bank credential |
| `VISACAL_PASSWORD` | Bank credential |

## CI/CD

Push to `main` triggers Cloud Build automatically:
1. Builds combined Docker image (`Dockerfile.cloud`)
2. Pushes to Artifact Registry
3. Deploys to Cloud Run with secrets and env vars

Trigger name: `fin-dash-deploy`
Build config: `cloudbuild.yaml`
Service account: `fin-dash-build@fin-dash-dabas.iam.gserviceaccount.com`

## Cost

| Service | Free Tier | Est. Usage | Cost |
|---|---|---|---|
| Cloud Run | 180K vCPU-sec | ~500 vCPU-sec | $0.00 |
| Secret Manager | 6 versions | 10 versions | ~$0.24 |
| Cloud Storage | 5 GB | <50 MB | $0.00 |
| Artifact Registry | 500 MB | ~500 MB | $0.00 |
| Cloud Build | 120 min/day | ~7 min/deploy | $0.00 |
| **Total** | | | **< $0.50/month** |
