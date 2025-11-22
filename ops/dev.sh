#!/usr/bin/env bash
set -euo pipefail

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

echo "Checking Postgres at $PGHOST:$PGPORT ..."
if ! (echo > /dev/tcp/$PGHOST/$PGPORT) >/dev/null 2>&1; then
  echo "ERROR: Postgres not reachable at $PGHOST:$PGPORT" >&2
  echo "Start Postgres locally or via Docker (docker compose up -d db) and re-run." >&2
  exit 1
fi

echo "Running migrations..."
npx --yes node-pg-migrate -m core/migrations -d "postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE" up || true

echo "Starting Core and Frontend dev servers in background..."
echo "Core: http://localhost:${PORT}  |  Frontend: http://localhost:5174"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Ensure logs directory exists
mkdir -p logs

# Start services in background using concurrently
nohup npx concurrently \
  -n core,front \
  -c auto \
  "ops/bin/log-run.sh core env LOG_CONSOLE=0 node core/src/server.js" \
  "ops/bin/log-run.sh front npm --workspace=front run dev" \
  > logs/dev-servers.log 2>&1 &

DEV_PID=$!

# Wait a moment to check if it started
sleep 3

if ps -p $DEV_PID > /dev/null 2>&1; then
  echo ""
  echo "✅ Development servers started successfully (PID: $DEV_PID)"
  echo ""
  echo "Services:"
  echo "  Core API: http://localhost:${PORT}"
  echo "  Frontend: http://localhost:5174"
  echo ""
  echo "Logs: logs/dev-servers.log"
  echo "View logs: tail -f logs/dev-servers.log"
  echo ""
  echo "To stop: kill $DEV_PID"
  echo "Or: pkill -f concurrently"
else
  echo "❌ Failed to start dev servers. Check logs/dev-servers.log"
  exit 1
fi
