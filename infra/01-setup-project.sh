#!/usr/bin/env bash
# =============================================================================
# One-time GCP project setup: enable APIs, create Artifact Registry,
# Cloud Storage bucket. Run this first before anything else.
# =============================================================================

set -euo pipefail

PROJECT_ID="fin-dash-dabas"
REGION="me-west1"
GCS_BUCKET="fin-dash-dabas-data"

echo "=== Setting project ==="
gcloud config set project "$PROJECT_ID"

echo "=== Enabling APIs ==="
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com

echo "=== Creating Artifact Registry repo ==="
gcloud artifacts repositories create fin-dash \
  --repository-format=docker \
  --location="$REGION" \
  --description="fin-dash Docker images" 2>/dev/null || echo "  (already exists)"

echo "=== Creating Cloud Storage bucket ==="
gcloud storage buckets create "gs://$GCS_BUCKET" \
  --location="$REGION" \
  --uniform-bucket-level-access 2>/dev/null || echo "  (already exists)"

echo ""
echo "Done. Next steps:"
echo "  1. ./scripts/setup-secrets.sh    # Create secrets from .env"
echo "  2. ./infra/02-create-service-accounts.sh  # Create SAs"
echo "  3. gcloud builds submit --config=cloudbuild.yaml  # First deploy"
