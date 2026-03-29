#!/bin/bash
set -e

# Usage: ./scripts/deploy.sh user@vm-ip
# Example: ./scripts/deploy.sh root@123.45.67.89

if [ -z "$1" ]; then
  echo "Usage: ./scripts/deploy.sh user@vm-ip"
  echo "Example: ./scripts/deploy.sh root@203.0.113.10"
  exit 1
fi

TARGET="$1"
REMOTE_DIR="/opt/teslapulse"
DEPLOY_ARCHIVE="teslapulse-deploy.tar.gz"

echo "=== TeslaPulse Deploy ==="
echo "Target: $TARGET:$REMOTE_DIR"
echo ""

# Step 1: Build
echo "[1/5] Building production bundle..."
npm run build

# Step 2: Create deployment archive
echo "[2/5] Creating deployment archive..."
tar czf "$DEPLOY_ARCHIVE" \
  .next/ \
  public/ \
  package.json \
  package-lock.json \
  next.config.ts \
  src/lib/db.ts \
  --exclude='.next/cache'

echo "  Archive size: $(du -h "$DEPLOY_ARCHIVE" | cut -f1)"

# Step 3: Transfer to VM
echo "[3/5] Transferring to VM..."
scp "$DEPLOY_ARCHIVE" "$TARGET:/tmp/$DEPLOY_ARCHIVE"

# Step 4: Extract and install on VM
echo "[4/5] Installing on VM..."
ssh "$TARGET" bash -s << 'REMOTE_SCRIPT'
set -e
REMOTE_DIR="/opt/teslapulse"

# Create directory if needed
mkdir -p "$REMOTE_DIR/data"

# Extract (overwrite .next, public, etc.)
cd "$REMOTE_DIR"
tar xzf "/tmp/teslapulse-deploy.tar.gz"
rm "/tmp/teslapulse-deploy.tar.gz"

# Install production dependencies
npm install --production --ignore-scripts
# Rebuild native modules (better-sqlite3)
npm rebuild better-sqlite3

echo "  Files installed to $REMOTE_DIR"
REMOTE_SCRIPT

# Step 5: Restart service
echo "[5/5] Restarting service..."
ssh "$TARGET" "systemctl restart teslapulse && systemctl status teslapulse --no-pager -l"

# Cleanup local archive
rm -f "$DEPLOY_ARCHIVE"

echo ""
echo "=== Deploy complete ==="
echo "  https://\$TARGET (deployed)"
echo ""
