#!/bin/bash
# Refreshes Tesla token locally and pushes to production.
# Run via Task Scheduler or cron every 6 hours.
# Usage: ./scripts/refresh-and-push.sh

set -e

LOCAL="http://localhost:3000"
PROD_PASSWORD_FILE="$HOME/.teslapulse-prod-pw"

echo "[$(date)] TeslaPulse token refresh + push"

# Check if local server is running
if ! curl -s -o /dev/null -w '' "$LOCAL/api/auth/status" 2>/dev/null; then
  echo "  Local server not running on port 3000. Starting dev server..."
  cd "$(dirname "$0")/.."
  npx next dev -p 3000 &
  DEV_PID=$!
  sleep 8
  STARTED_SERVER=true
else
  STARTED_SERVER=false
fi

# Login locally to get a session
LOCAL_PW=$(cat "$HOME/.teslapulse-local-pw" 2>/dev/null || echo "")
if [ -z "$LOCAL_PW" ]; then
  echo "  ERROR: Create $HOME/.teslapulse-local-pw with your local password"
  [ "$STARTED_SERVER" = true ] && kill $DEV_PID 2>/dev/null
  exit 1
fi

SESSION=$(curl -s -c - "$LOCAL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$LOCAL_PW\"}" 2>/dev/null | grep teslapulse_session | awk '{print $NF}')

if [ -z "$SESSION" ]; then
  echo "  ERROR: Local login failed"
  [ "$STARTED_SERVER" = true ] && kill $DEV_PID 2>/dev/null
  exit 1
fi

COOKIE="teslapulse_session=$SESSION"

# Force a token refresh by hitting the debug endpoint (triggers getAccessToken)
echo "  Refreshing token..."
REFRESH_RESULT=$(curl -s -b "$COOKIE" "$LOCAL/api/debug/tesla-raw" 2>/dev/null | head -c 100)
echo "  Refresh result: $REFRESH_RESULT"

# Check token status
TOKEN_STATUS=$(curl -s -b "$COOKIE" "$LOCAL/api/tesla/sync-token")
echo "  Token status: $TOKEN_STATUS"

# Push to production
PROD_PW=$(cat "$PROD_PASSWORD_FILE" 2>/dev/null || echo "")
if [ -z "$PROD_PW" ]; then
  echo "  ERROR: Create $PROD_PASSWORD_FILE with your production password"
  [ "$STARTED_SERVER" = true ] && kill $DEV_PID 2>/dev/null
  exit 1
fi

echo "  Pushing to production..."
PUSH_RESULT=$(curl -s -b "$COOKIE" "$LOCAL/api/tesla/push-tokens" \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$PROD_PW\"}")
echo "  Push result: $PUSH_RESULT"

# Cleanup
if [ "$STARTED_SERVER" = true ]; then
  kill $DEV_PID 2>/dev/null
  echo "  Stopped dev server"
fi

echo "[$(date)] Done"
