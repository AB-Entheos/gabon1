#!/usr/bin/env bash
# HEC Emergency Fund — push from local machine to production server.
# Run from the repo root on YOUR local machine (Windows/Mac/Linux).
#
# Prerequisites:
#   - SSH access to the server (ssh ubuntu@100.58.123.184)
#   - .env file configured for production
#
# Usage:
#   ./deploy_remote.sh              # Deploy code only
#   ./deploy_remote.sh --seed-real  # Deploy + create production user accounts
set -euo pipefail

SERVER="ubuntu@100.58.123.184"
REMOTE_DIR="/opt/hec"
SSH_KEY="$HOME/.ssh/id_ed25519"
SEED_FLAG=""

for arg in "$@"; do
    case "$arg" in
        --seed-real) SEED_FLAG="--seed-real" ;;
    esac
done

# Use explicit SSH key if it exists, otherwise use default
SSH_OPTS=""
if [ -f "$SSH_KEY" ]; then
    SSH_OPTS="-i $SSH_KEY"
fi

echo "=== HEC Emergency Fund — Remote Deploy ==="
echo "Server: $SERVER"
echo "Remote dir: $REMOTE_DIR"
echo

# 1. Push .env to server
echo "[1/4] Pushing .env to server..."
if [ -f .env ]; then
    scp $SSH_OPTS .env "$SERVER:$REMOTE_DIR/.env"
    echo "  ✅ .env pushed"
else
    echo "  ⚠️  No .env file found — skipping (server must already have one)"
fi

# 2. Push code via git (faster than scp for large repos)
echo "[2/4] Pushing code to server..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    git push origin main 2>/dev/null || echo "  ⚠️  git push failed (may not be a git repo on server)"
else
    echo "  ⚠️  Not a git repo — use scp to push files manually"
fi

# 3. Run deploy on server
echo "[3/4] Running deploy on server..."
ssh $SSH_OPTS "$SERVER" "cd $REMOTE_DIR && chmod +x deploy.sh && ./deploy.sh $SEED_FLAG"

# 4. Verify
echo "[4/4] Verifying..."
sleep 3
if curl -fsS "https://hec.ab-entheos.com/health" 2>/dev/null; then
    echo
    echo "🎉 Deployment successful! https://hec.ab-entheos.com"
else
    echo
    echo "❌ Health check failed — check server logs"
    exit 1
fi
