#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="compose" # or local-core
WITH_CADDY="false"
TAIL_CORE="false"
BUILD_MODE="no-build" # values: no-build | build

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-core)
      MODE="local-core"
      shift
      ;;
    --with-caddy)
      WITH_CADDY="true"
      shift
      ;;
    --tail-core)
      TAIL_CORE="true"
      shift
      ;;
    --build)
      BUILD_MODE="build"
      shift
      ;;
    --no-build)
      BUILD_MODE="no-build"
      shift
      ;;
    -h|--help)
  echo "Usage: ops/start.sh [--local-core] [--with-caddy] [--tail-core] [--build|--no-build]";
      echo "  --local-core  Run Core locally (Node) with DB/NATS in Docker";
      echo "  --with-caddy  Also run Caddy reverse proxy (Compose profile)";
  echo "  --tail-core   Tail Core container logs in this terminal (off by default)";
      echo "  --build       Force docker compose to rebuild images before starting (default: no-build)";
      echo "  --no-build    Do not rebuild images (faster dev cycles; default)";
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

if [[ ! -f .env ]]; then
  echo ".env not found; copying from .env.example"
  cp .env.example .env || true
fi

ensure_db_nats() {
  echo "Bringing up Postgres and NATS..."
  docker compose up -d db nats
}

wait_for_core() {
  local url=${1:-http://localhost:3000/health}
  echo "Waiting for Core at $url ..."
  for i in $(seq 1 60); do
    if curl -sf "$url" >/dev/null; then echo "Core is up"; return 0; fi
    sleep 1
  done
  echo "Timed out waiting for Core" >&2
  return 1
}

if [[ "$MODE" == "local-core" ]]; then
  ensure_db_nats

  echo "Installing local deps (root + core) ..."
  npm install >/dev/null 2>&1 || true
  npm --workspace=core install >/dev/null 2>&1 || true

  echo "Running migrations locally..."
  export PGHOST=${PGHOST:-localhost}
  export PGPORT=${PGPORT:-5432}
  export PGUSER=${PGUSER:-postgres}
  export PGPASSWORD=${PGPASSWORD:-postgres}
  export PGDATABASE=${PGDATABASE:-dataforeman}
  npx --yes node-pg-migrate -m core/migrations -d "postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE" up || true

  echo "Starting Core locally (logs below)..."
  export LOG_LEVEL=${LOG_LEVEL:-debug}
  export HOST=${HOST:-0.0.0.0}
  export PORT=${PORT:-3000}
  export JWT_SECRET=${JWT_SECRET:-dev-secret-change-me}
  export DEMO_PASSWORD=${DEMO_PASSWORD:-password}
  # Wire TimescaleDB env for local-core runs (defaults match .env)
  export TSDB_HOST=${TSDB_HOST:-localhost}
  export TSDB_PORT=${TSDB_PORT:-5433}
  export TSDB_USER=${TSDB_USER:-tsdb}
  export TSDB_PASSWORD=${TSDB_PASSWORD:-tsdb}
  export TSDB_DATABASE=${TSDB_DATABASE:-telemetry}
  node core/src/server.js &
  CORE_PID=$!
  trap 'kill $CORE_PID 2>/dev/null || true' EXIT

  wait_for_core "http://localhost:${PORT}/health" || true
  echo "Core: http://localhost:${PORT}"
  echo "Web (optional dev server): npm --workspace=web run dev"
  echo "Demo login: admin@example.com / password"
  echo
  echo "Follow logs (Ctrl+C to stop):"
  wait $CORE_PID
  exit $?
fi

if [[ "$BUILD_MODE" == "build" ]]; then
  echo "Building and starting full stack via Docker Compose (db, nats, core, web, connectivity, ingestor, rotator)..."
  docker compose up -d --build db nats core web connectivity ingestor rotator
else
  echo "Starting full stack via Docker Compose without rebuild (db, nats, core, web, connectivity, ingestor, rotator)..."
  docker compose up -d db nats core web connectivity ingestor rotator
fi
if [[ "$WITH_CADDY" == "true" ]]; then
  docker compose --profile tls up -d caddy
fi

wait_for_core "http://localhost:3000/health" || true
echo
echo "Services ready:"
echo "  Core: http://localhost:3000"
echo "  Web:  http://localhost:8080"
echo "  Connectivity: http://localhost:3100"
echo "  Ingestor: running (container)"
[[ "$WITH_CADDY" == "true" ]] && echo "  Caddy: http://localhost"
echo "  Demo login: admin@example.com / password"
echo
if [[ "$TAIL_CORE" == "true" ]]; then
  echo "Tailing Core logs (Ctrl+C to stop):"
  docker compose logs -f core
else
  echo "Core logs not tailed. Use: docker compose logs -f core  (or rerun with --tail-core)"
fi
