#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🔨 Rebuilding everything (All Docker services + Frontend)..."
echo ""

# Fix permissions first
echo "🔧 Fixing permissions..."
if [ -f "$ROOT_DIR/fix-permissions.sh" ]; then
  bash "$ROOT_DIR/fix-permissions.sh"
else
  echo "⚠️  Warning: fix-permissions.sh not found, skipping..."
fi
echo ""

# Auto-configure for Linux to enable EIP autodiscovery (same as start.sh)
if [[ "$(uname -s)" == "Linux" ]]; then
  if ! grep -q "^[[:space:]]*network_mode: host" docker-compose.yml; then
    echo "🔧 Configuring host networking for Linux (enables EIP autodiscovery)..."
    
    # Uncomment network_mode: host in docker-compose.yml
    sed -i 's|^[[:space:]]*# network_mode: host|    network_mode: host|' docker-compose.yml
    
    # Update .env for host networking
    if [ ! -f .env ]; then
      echo "Creating .env from .env.example..."
      cp .env.example .env || true
    fi
    
    if [ ! -f .gitignore ]; then
      echo "Creating .gitignore from .gitignore.example..."
      cp .gitignore.example .gitignore || true
    fi
    
    if ! grep -q "^NATS_URL=nats://localhost:4222" .env; then
      if grep -q "^NATS_URL=" .env; then
        sed -i 's|^NATS_URL=.*|NATS_URL=nats://localhost:4222|' .env
      else
        echo "NATS_URL=nats://localhost:4222" >> .env
      fi
    fi
    if ! grep -q "^PGHOST=localhost" .env; then
      if grep -q "^PGHOST=" .env; then
        sed -i 's|^PGHOST=.*|PGHOST=localhost|' .env
      else
        echo "PGHOST=localhost" >> .env
      fi
    fi
    if ! grep -q "^TSDB_HOST=localhost" .env; then
      if grep -q "^TSDB_HOST=" .env; then
        sed -i 's|^TSDB_HOST=.*|TSDB_HOST=localhost|' .env
      else
        echo "TSDB_HOST=localhost" >> .env
      fi
    fi
    
    echo "✅ Configured for host networking (EIP autodiscovery enabled)"
    echo ""
  fi
fi
echo ""

# Build Docker services
echo "📦 Building Docker services (core, connectivity, front)..."
docker compose build core connectivity front

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
docker compose up -d db nats tsdb core connectivity rotator front

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
