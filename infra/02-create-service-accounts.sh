#!/usr/bin/env bash
# =============================================================================
# Create dedicated service accounts with least-privilege permissions.
# Two SAs: one for Cloud Run runtime, one for Cloud Build CI/CD.
# =============================================================================

set -euo pipefail

PROJECT_ID="fin-dash-dabas"
GCS_BUCKET="fin-dash-dabas-data"

RUN_SA="fin-dash-run@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SA="fin-dash-build@${PROJECT_ID}.iam.gserviceaccount.com"

# ---------------------------------------------------------------------------
# Cloud Run SA — used by the running container
# ---------------------------------------------------------------------------
echo "=== Creating Cloud Run SA ==="
gcloud iam service-accounts create fin-dash-run \
  --display-name="fin-dash Cloud Run" \
  --description="Least-privilege SA for fin-dash Cloud Run service" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (already exists)"

echo "  Granting secretmanager.secretAccessor (read bank credentials + AUTH_TOKEN)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/secretmanager.secretAccessor" --quiet > /dev/null

echo "  Granting storage.objectAdmin on gs://$GCS_BUCKET (SQLite backup)"
gcloud storage buckets add-iam-policy-binding "gs://$GCS_BUCKET" \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/storage.objectAdmin" --quiet > /dev/null

# ---------------------------------------------------------------------------
# Cloud Build SA — used by CI/CD trigger
# ---------------------------------------------------------------------------
echo ""
echo "=== Creating Cloud Build SA ==="
gcloud iam service-accounts create fin-dash-build \
  --display-name="fin-dash Cloud Build" \
  --description="Dedicated SA for Cloud Build triggers" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (already exists)"

echo "  Granting logging.logWriter (write build logs)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" \
  --role="roles/logging.logWriter" --quiet > /dev/null

echo "  Granting artifactregistry.writer (push Docker images)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" \
  --role="roles/artifactregistry.writer" --quiet > /dev/null

echo "  Granting run.admin (deploy to Cloud Run)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" \
  --role="roles/run.admin" --quiet > /dev/null

echo "  Granting secretmanager.secretAccessor (pass --set-secrets during deploy)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$BUILD_SA" \
  --role="roles/secretmanager.secretAccessor" --quiet > /dev/null

echo "  Granting iam.serviceAccountUser on $RUN_SA (deploy as Cloud Run SA)"
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member="serviceAccount:$BUILD_SA" \
  --role="roles/iam.serviceAccountUser" --quiet > /dev/null

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Service Accounts Created ==="
echo ""
echo "Cloud Run SA:  $RUN_SA"
echo "  - secretmanager.secretAccessor (project)"
echo "  - storage.objectAdmin (gs://$GCS_BUCKET only)"
echo ""
echo "Cloud Build SA: $BUILD_SA"
echo "  - logging.logWriter"
echo "  - artifactregistry.writer"
echo "  - run.admin"
echo "  - secretmanager.secretAccessor"
echo "  - iam.serviceAccountUser on $RUN_SA"
echo ""
echo "Next: Create Cloud Build trigger in the console using $BUILD_SA"
echo "  https://console.cloud.google.com/cloud-build/triggers/add?project=$PROJECT_ID"
