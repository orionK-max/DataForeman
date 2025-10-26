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

echo "Starting Core and Web dev servers (logs below)."
echo "Core: http://localhost:${PORT}  |  Web: http://localhost:5173"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npx concurrently \
  -n core,web \
  -c auto \
  "ops/bin/log-run.sh core env LOG_CONSOLE=0 node core/src/server.js" \
  "ops/bin/log-run.sh web npm --workspace=web run dev"
