#!/bin/bash
# ============================================
# AI Social Network — Deploy Script
# ============================================
# Usage: ssh into server, then run:
#   bash scripts/deploy.sh
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - .env file present in project root with real values
#   - Git repo cloned and on master branch
# ============================================

set -e

echo "=== AI Social Network Deploy ==="
echo ""

# Verify .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and fill in real values."
  exit 1
fi

# Pull latest code
echo "[1/4] Pulling latest code from master..."
git pull origin master

# Rebuild containers (no cache for clean builds)
echo "[2/4] Building Docker images (no cache)..."
docker compose build --no-cache

# Start services in detached mode
echo "[3/4] Starting services..."
docker compose up -d

# Show status
echo "[4/4] Service status:"
docker compose ps

echo ""
echo "=== Deploy complete ==="
echo "  Web:   http://localhost:3000"
echo "  Agent: http://localhost:4000/health"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f         # Follow all logs"
echo "  docker compose logs agent -f    # Follow agent logs only"
echo "  docker compose logs web -f      # Follow web logs only"
echo "  docker compose restart agent    # Restart agent service"
echo "  docker compose down             # Stop all services"
