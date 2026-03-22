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

log "============================================"
log "SCRAPE RUN STARTED"
log "============================================"

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

# ---------------------------------------------------------------------------
# Step 1: Start local server
# ---------------------------------------------------------------------------
log "[1/4] Starting local server on port $SCRAPE_PORT..."

cd "$PROJECT_DIR/server"
npx tsx src/index.ts >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!

WAIT_START=$(date +%s)
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$SCRAPE_PORT/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
WAIT_END=$(date +%s)
WAIT_SECS=$((WAIT_END - WAIT_START))

if ! curl -sf "http://localhost:$SCRAPE_PORT/api/health" > /dev/null 2>&1; then
  log "[1/4] FAILED: Server did not start after ${WAIT_SECS}s"
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

log "[1/4] Server ready in ${WAIT_SECS}s (PID: $SERVER_PID)"

# ---------------------------------------------------------------------------
# Step 2: Trigger scrape
# ---------------------------------------------------------------------------
log "[2/4] Triggering bank scrape..."
SCRAPE_START=$(date +%s)

RESPONSE=$(curl -sf -X POST "http://localhost:$SCRAPE_PORT/api/scheduler/trigger" -H "Authorization: Bearer $AUTH_TOKEN" 2>&1 || echo "FAILED")

if echo "$RESPONSE" | grep -q '"success":true'; then
  log "[2/4] Scrape triggered successfully"
else
  log "[2/4] FAILED to trigger scrape: $RESPONSE"
fi

# Wait for scrape to complete (up to 5 minutes)
log "[2/4] Waiting for scrape to finish..."
for i in $(seq 1 60); do
  sleep 5
  STATUS=$(curl -sf "http://localhost:$SCRAPE_PORT/api/scheduler/status" -H "Authorization: Bearer $AUTH_TOKEN" 2>&1 || echo "{}")
  RUNNING=$(echo "$STATUS" | grep -o '"running":true' || true)
  if [ -z "$RUNNING" ]; then
    break
  fi
done

SCRAPE_END=$(date +%s)
SCRAPE_SECS=$((SCRAPE_END - SCRAPE_START))

# Get scrape results from scheduler status
LAST_STATUS=$(curl -sf "http://localhost:$SCRAPE_PORT/api/scheduler/status" -H "Authorization: Bearer $AUTH_TOKEN" 2>&1 || echo "{}")
LAST_ERROR=$(echo "$LAST_STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('lastError') or 'none')" 2>/dev/null || echo "unknown")

# Get transaction counts from health
HEALTH=$(curl -sf "http://localhost:$SCRAPE_PORT/api/health" 2>&1 || echo "{}")
TX_COUNT=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('database',{}).get('totalTransactions',0))" 2>/dev/null || echo "?")
ACCT_COUNT=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('database',{}).get('totalAccounts',0))" 2>/dev/null || echo "?")

log "[2/4] Scrape completed in ${SCRAPE_SECS}s"
log "[2/4] DB stats: ${TX_COUNT} transactions, ${ACCT_COUNT} accounts"
log "[2/4] Last error: ${LAST_ERROR}"

# ---------------------------------------------------------------------------
# Step 3: Stop server
# ---------------------------------------------------------------------------
log "[3/4] Stopping server..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
log "[3/4] Server stopped"

# ---------------------------------------------------------------------------
# Step 4: Upload DB to Cloud Run
# ---------------------------------------------------------------------------
if [ -f "$DB_PATH" ]; then
  DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
  log "[4/4] Uploading DB to Cloud Run (${DB_SIZE})..."

  sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true

  UPLOAD_START=$(date +%s)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$CLOUD_RUN_URL/api/db/upload" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@$DB_PATH")
  UPLOAD_END=$(date +%s)
  UPLOAD_SECS=$((UPLOAD_END - UPLOAD_START))

  if [ "$HTTP_CODE" = "200" ]; then
    log "[4/4] Upload successful (HTTP $HTTP_CODE, ${UPLOAD_SECS}s)"
  else
    log "[4/4] FAILED: Upload returned HTTP $HTTP_CODE (${UPLOAD_SECS}s)"
  fi
else
  log "[4/4] FAILED: DB file not found at $DB_PATH"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL_END=$(date +%s)
TOTAL_START_EPOCH=$(date -j -f "%Y-%m-%d %H:%M:%S" "$(grep "SCRAPE RUN STARTED" "$LOG_FILE" | tail -1 | sed 's/\[//' | sed 's/\].*//')" +%s 2>/dev/null || echo "$SCRAPE_START")
TOTAL_SECS=$((TOTAL_END - TOTAL_START_EPOCH))

log "--------------------------------------------"
log "SCRAPE RUN FINISHED"
log "  Total time:    ${TOTAL_SECS}s"
log "  Scrape time:   ${SCRAPE_SECS}s"
log "  Transactions:  ${TX_COUNT}"
log "  Accounts:      ${ACCT_COUNT}"
log "  Upload:        HTTP ${HTTP_CODE:-N/A}"
log "============================================"
log ""
