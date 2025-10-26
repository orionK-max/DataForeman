#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🔨 Rebuilding everything (All Docker services + Frontend)..."
echo ""

# Build Docker services
echo "📦 Building Docker services (core, connectivity, ingestor, front)..."
docker compose build core connectivity ingestor front

# Install/update frontend dependencies
echo "📦 Installing frontend dependencies..."
cd front
npm install

# Build frontend for production (optional - comment out if not needed)
# echo "🏗️  Building frontend for production..."
# npm run build

cd "$ROOT_DIR"

echo ""
echo "✅ Rebuild complete!"
echo ""

echo "🔍 Validating permission checks..."
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
echo "🚀 Starting services..."
echo "   Core API: http://localhost:3000"
echo "   Frontend Dev: http://localhost:5174"
echo "   Frontend Prod: http://localhost:8080"
echo ""

# Start all services
docker compose up -d db nats tsdb core connectivity ingestor rotator front

# Start frontend in dev mode (background)
cd front
echo "🎨 Starting frontend dev server in background..."
nohup npm run dev > ../logs/frontend-dev.log 2>&1 &
FRONTEND_PID=$!

# Wait a moment for the server to start
sleep 2

# Check if it's running
if ps -p $FRONTEND_PID > /dev/null; then
    echo "✅ Frontend dev server started (PID: $FRONTEND_PID)"
    echo "   Logs: $ROOT_DIR/logs/frontend-dev.log"
    echo ""
    echo "To stop the frontend: kill $FRONTEND_PID"
    echo "Or use: pkill -f 'vite --port 5174'"
else
    echo "❌ Frontend dev server failed to start. Check logs/frontend-dev.log"
    exit 1
fi

echo ""
echo "🎉 All services running!"
