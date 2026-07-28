#!/usr/bin/env bash
# HEC Emergency Fund — idempotent deploy script.
# Run from the repo root on the production VPS (Ubuntu 22.04).
# Usage:  ./deploy.sh [--seed-real]   # pass --seed-real to create production users
set -euo pipefail

REPO_DIR="/opt/hec"
BACKEND_DIR="$REPO_DIR/backend"
FRONTEND_DIR="$REPO_DIR/frontend"
SEED_REAL=0

for arg in "$@"; do
    case "$arg" in
        --seed-real) SEED_REAL=1 ;;
    esac
done

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

echo "[1/9] Pull latest"
cd "$REPO_DIR"
git pull --ff-only

# Validate .env exists and has production settings
if [ ! -f "$REPO_DIR/.env" ]; then
    echo "ERROR: .env file not found at $REPO_DIR/.env"
    echo "Copy .env.example and fill in production values first."
    exit 1
fi

if grep -q "ALLOWED_HOSTS=localhost" "$REPO_DIR/.env" && ! grep -q "ALLOWED_HOSTS=.*hec.ab-entheos.com" "$REPO_DIR/.env"; then
    echo "WARNING: ALLOWED_HOSTS does not include hec.ab-entheos.com"
    echo "The site will return 400 Bad Request for all requests."
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "[2/9] Build frontend (Bun)"
cd "$FRONTEND_DIR"
$COMPOSE_CMD run --rm frontend-builder

echo "[3/9] Build backend image"
cd "$REPO_DIR"
$COMPOSE_CMD build backend

echo "[4/9] Run migrations"
cd "$BACKEND_DIR"
$COMPOSE_CMD run --rm backend python manage.py migrate --noinput
$COMPOSE_CMD run --rm backend python manage.py compilemessages || true
$COMPOSE_CMD run --rm backend python manage.py collectstatic --noinput

echo "[5/9] Restart services"
$COMPOSE_CMD down
$COMPOSE_CMD up -d

echo "[6/9] Health check"
sleep 5
if curl -fsS http://localhost/api/v1/health; then
    echo
    echo "✅ Backend is healthy"
else
    echo
    echo "❌ Backend health check FAILED — check logs with: docker compose logs backend"
    exit 1
fi

echo "[7/9] Seed demo data (idempotent — always runs)"
cd "$BACKEND_DIR"
$COMPOSE_CMD run --rm backend python manage.py seed_demo_data || true

echo "[8/9] Seed real production users (only if --seed-real flag passed)"
if [[ "$SEED_REAL" -eq 1 ]]; then
    cd "$BACKEND_DIR"
    $COMPOSE_CMD run --rm backend python manage.py seed_real_data
else
    echo "  Skipped. Run with --seed-real to create production accounts."
fi

echo "[9/9] Done."

# Print status
echo ""
echo "=== Service Status ==="
$COMPOSE_CMD ps
