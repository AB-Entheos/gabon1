#!/usr/bin/env bash
# HEC Emergency Fund — idempotent deploy script.
# Run from the repo root on the production VPS (Ubuntu 22.04).
# Usage:  ./deploy.sh
set -euo pipefail

REPO_DIR="/opt/hec"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Error: Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Determine the correct docker compose command
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo "[1/8] Pull latest"
cd "$REPO_DIR"
git pull --ff-only

echo "[2/8] Build frontend (Bun)"
cd "$FRONTEND_DIR"
$COMPOSE_CMD run --rm frontend-builder

echo "[3/8] Build backend image"
cd "$REPO_DIR"
$COMPOSE_CMD build backend

echo "[4/8] Run migrations"
cd "$BACKEND_DIR"
$COMPOSE_CMD run --rm backend python manage.py migrate --noinput
$COMPOSE_CMD run --rm backend python manage.py compilemessages || true
$COMPOSE_CMD run --rm backend python manage.py collectstatic --noinput

echo "[5/8] Restart services"
$COMPOSE_CMD down
$COMPOSE_CMD up -d

echo "[6/8] Health check"
sleep 5
curl -fsS http://localhost/api/v1/health | tee /dev/stderr
echo

echo "[7/8] Seed (idempotent — only runs if SEED=1)"
if [[ "${SEED:-0}" == "1" ]]; then
    cd "$BACKEND_DIR"
    $COMPOSE_CMD run --rm backend python manage.py seed_demo_data
fi

echo "[8/8] Done."

# Print status
echo "\n=== Service Status ==="
$COMPOSE_CMD ps
