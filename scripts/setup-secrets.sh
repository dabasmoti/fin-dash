#!/usr/bin/env bash
# =============================================================================
# Creates GCP Secret Manager secrets from the local .env file.
# Values are piped directly — never appear in shell history or ps output.
#
# Usage:
#   ./scripts/setup-secrets.sh
#   ./scripts/setup-secrets.sh --delete   # remove all secrets first (for re-run)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi

# Secrets to create from .env (variable name = secret name)
BANK_SECRETS=(
  BEINLEUMI_USERNAME
  BEINLEUMI_PASSWORD
  MAX_USERNAME
  MAX_PASSWORD
  ISRACARD_ID
  ISRACARD_CARD6DIGITS
  ISRACARD_PASSWORD
  VISACAL_USERNAME
  VISACAL_PASSWORD
)

# Read a value from .env by key (handles = in values, strips quotes)
read_env_value() {
  local key="$1"
  local value
  value=$(grep "^${key}=" "$ENV_FILE" | head -1 | sed "s/^${key}=//" | sed 's/^["'\'']//' | sed 's/["'\'']$//')
  echo -n "$value"
}

# Delete existing secrets if --delete flag is passed
if [ "${1:-}" = "--delete" ]; then
  echo "Deleting existing secrets..."
  for secret in AUTH_TOKEN "${BANK_SECRETS[@]}"; do
    gcloud secrets delete "$secret" --quiet 2>/dev/null && echo "  Deleted $secret" || true
  done
  echo ""
fi

# Generate AUTH_TOKEN
echo "Generating AUTH_TOKEN..."
AUTH_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo -n "$AUTH_TOKEN" | gcloud secrets create AUTH_TOKEN --data-file=- 2>/dev/null && \
  echo "  Created AUTH_TOKEN" || \
  echo "  AUTH_TOKEN already exists (use --delete to recreate)"

echo ""
echo "Creating bank credential secrets from .env..."

for secret in "${BANK_SECRETS[@]}"; do
  value=$(read_env_value "$secret")

  if [ -z "$value" ]; then
    echo "  Skipped $secret (empty or not found in .env)"
    continue
  fi

  echo -n "$value" | gcloud secrets create "$secret" --data-file=- 2>/dev/null && \
    echo "  Created $secret" || \
    echo "  $secret already exists (use --delete to recreate)"
done

# Grant Cloud Run service account access
echo ""
echo "Granting service account access..."

PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get project)" --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for secret in AUTH_TOKEN "${BANK_SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet 2>/dev/null && \
    echo "  Granted access to $secret" || true
done

# Grant storage access
GCS_BUCKET="fin-dash-dabas-data"
gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --member="serviceAccount:$SA" \
  --role="roles/storage.objectAdmin" \
  --quiet 2>/dev/null && \
  echo "  Granted storage access to $GCS_BUCKET" || true

echo ""
echo "========================================="
echo "Your AUTH_TOKEN (save this — it's your dashboard password):"
echo "$AUTH_TOKEN"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Save the AUTH_TOKEN above"
echo "  2. Run: gcloud builds submit --config=cloudbuild.yaml"
