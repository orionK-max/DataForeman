#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Config
export PGHOST=${PGHOST:-localhost}
export PGPORT=${PGPORT:-5432}
export PGUSER=${PGUSER:-postgres}
export PGPASSWORD=${PGPASSWORD:-postgres}
export PGDATABASE=${PGDATABASE:-dataforeman}
export LOG_LEVEL=${LOG_LEVEL:-debug}
export HOST=${HOST:-0.0.0.0}
export PORT=${PORT:-3000}
export JWT_SECRET=${JWT_SECRET:-change-me}
export DEMO_PASSWORD=${DEMO_PASSWORD:-password}
export LOG_CONSOLE=${LOG_CONSOLE:-0}

echo "🚀 Starting DataForeman in Development Mode"
echo ""

# Fix permissions first
echo "🔧 Fixing permissions..."
if [ -f "$ROOT_DIR/fix-permissions.sh" ]; then
  bash "$ROOT_DIR/fix-permissions.sh"
else
  echo "⚠️  Warning: fix-permissions.sh not found, skipping..."
fi
echo ""

# Ensure .env exists
if [[ ! -f .env ]]; then
  echo ".env not found; copying from .env.example"
  cp .env.example .env || true
fi

# Ensure .gitignore exists
if [[ ! -f .gitignore ]]; then
  echo ".gitignore not found; copying from .gitignore.example"
  cp .gitignore.example .gitignore || true
fi

# Check if node_modules exists, install if needed
if [ ! -d "front/node_modules" ]; then
  echo "📦 Installing dependencies (first time setup)..."
  npm install
  echo ""
fi

# Start Docker services (db, nats, tsdb, core, connectivity, rotator)
echo "📦 Starting Docker services..."
docker compose up -d db nats tsdb core connectivity rotator
echo ""

# Wait a moment for services to be ready
echo "⏳ Waiting for services to start..."
sleep 3

echo "Checking Postgres at $PGHOST:$PGPORT ..."
# Wait up to 30 seconds for Postgres
for i in $(seq 1 30); do
  if (echo > /dev/tcp/$PGHOST/$PGPORT) >/dev/null 2>&1; then
    echo "✅ Postgres is ready"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "ERROR: Postgres not reachable at $PGHOST:$PGPORT after 30 seconds" >&2
    echo "Check logs: docker compose logs db" >&2
    exit 1
  fi
  sleep 1
done
echo ""

echo "Running migrations..."
npx --yes node-pg-migrate -m core/migrations -d "postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE" up || true
echo ""

echo "Validating permission checks..."
if ! node ops/validate-permissions.js; then
  echo "⚠️  WARNING: Permission validation failed. Some routes may be missing permission checks." >&2
  echo "Continue? (y/N) " >&2
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "Startup cancelled." >&2
    exit 1
  fi
fi
echo ""

echo "🎨 Starting Frontend dev server (with hot reload)..."
echo ""
echo "Services ready:"
echo "  Core API (Docker): http://localhost:3000"
echo "  Frontend (Local): http://localhost:5174"
echo "  Connectivity: http://localhost:3100"
echo ""
echo "Frontend dev server running in background..."
echo "  Logs: $ROOT_DIR/logs/frontend-dev.log"
echo "  To stop: pkill -f 'vite --port 5174'"
echo "  To view logs: tail -f $ROOT_DIR/logs/frontend-dev.log"
echo ""
echo "To stop Docker services: docker compose down"
echo ""

# Ensure logs directory exists
mkdir -p "$ROOT_DIR/logs"

# Start frontend in background
cd front
nohup npm run dev > ../logs/frontend-dev.log 2>&1 &
FRONTEND_PID=$!

# Wait a moment to check if it started successfully
sleep 2

if ps -p $FRONTEND_PID > /dev/null 2>&1; then
  echo "✅ Frontend dev server started successfully (PID: $FRONTEND_PID)"
  echo ""
  echo "🎉 Development environment ready!"
else
  echo "❌ Frontend dev server failed to start. Check logs/frontend-dev.log for details"
  exit 1
fi
