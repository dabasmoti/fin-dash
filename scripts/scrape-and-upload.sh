#!/usr/bin/env bash
# =============================================================================
# Scrape all banks locally and upload the DB to Cloud Run.
# Runs daily at 12:00 via macOS launchd.
# Cloud Run saves the DB to GCS for persistence.
# =============================================================================

set -euo pipefail

PROJECT_DIR="/Users/motidabastani/fin-dash"
LOG_FILE="$PROJECT_DIR/scripts/scrape.log"
DB_PATH="$PROJECT_DIR/server/data/fin-dash.db"
SCRAPE_PORT=3099
CLOUD_RUN_URL="https://fin-dash-orohbgl3yq-zf.a.run.app"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "=== Starting scrape ==="

# Load environment
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$PROJECT_DIR"

# Source .env
set -a
source "$PROJECT_DIR/.env"
set +a

AUTH_TOKEN="${AUTH_TOKEN:-}"
if [ -z "$AUTH_TOKEN" ]; then
  log "ERROR: AUTH_TOKEN not set in .env"
  exit 1
fi

# Use a dedicated port to avoid conflicting with dev server
export SERVER_PORT="$SCRAPE_PORT"
export SCHEDULER_ENABLED=false
export GCS_BUCKET=""

# Start server in background
cd "$PROJECT_DIR/server"
npx tsx src/index.ts >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!

# Wait for server to be ready (up to 60s)
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$SCRAPE_PORT/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf "http://localhost:$SCRAPE_PORT/api/health" > /dev/null 2>&1; then
  log "ERROR: Server failed to start on port $SCRAPE_PORT"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

log "Server started on port $SCRAPE_PORT, triggering scrape..."

# Trigger scrape
RESPONSE=$(curl -sf -X POST "http://localhost:$SCRAPE_PORT/api/scheduler/trigger" -H "Authorization: Bearer $AUTH_TOKEN" 2>&1 || echo "FAILED")
log "Trigger response: $RESPONSE"

# Wait for scrape to complete (up to 5 minutes)
for i in $(seq 1 60); do
  sleep 5
  STATUS=$(curl -sf "http://localhost:$SCRAPE_PORT/api/scheduler/status" -H "Authorization: Bearer $AUTH_TOKEN" 2>&1 || echo "{}")
  RUNNING=$(echo "$STATUS" | grep -o '"running":true' || true)
  if [ -z "$RUNNING" ]; then
    break
  fi
done

log "Scrape completed"

# Stop server gracefully
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
log "Server stopped"

# Upload DB to Cloud Run (Cloud Run saves it to GCS)
if [ -f "$DB_PATH" ]; then
  sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$CLOUD_RUN_URL/api/db/upload" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@$DB_PATH")

  if [ "$HTTP_CODE" = "200" ]; then
    log "Uploaded DB to Cloud Run (HTTP $HTTP_CODE)"
  else
    log "ERROR: Upload failed (HTTP $HTTP_CODE)"
  fi
else
  log "ERROR: DB file not found at $DB_PATH"
fi

log "=== Done ==="
