#!/usr/bin/env sh
set -e

if [ -n "${PGHOST}" ]; then
  echo "Waiting for Postgres at $PGHOST:$PGPORT..."
  i=1
  until node -e "const net=require('net');const s=net.connect(process.env.PGPORT, process.env.PGHOST, ()=>{s.end();process.exit(0)}); s.on('error',()=>process.exit(1))" >/dev/null 2>&1; do
    echo "  attempt $i..."; i=$((i+1)); sleep 1;
    if [ "$i" -gt 60 ]; then echo "Giving up waiting for Postgres"; break; fi
  done
  echo "Running migrations on main database..."
  npx --yes node-pg-migrate -m migrations \
    --check-order false \
    -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE up || true
fi

# Wait for and migrate TimescaleDB
if [ -n "${TSDB_HOST}" ]; then
  echo "Waiting for TimescaleDB at $TSDB_HOST:$TSDB_PORT..."
  i=1
  until node -e "const net=require('net');const s=net.connect(process.env.TSDB_PORT, process.env.TSDB_HOST, ()=>{s.end();process.exit(0)}); s.on('error',()=>process.exit(1))" >/dev/null 2>&1; do
    echo "  attempt $i..."; i=$((i+1)); sleep 1;
    if [ "$i" -gt 60 ]; then echo "Giving up waiting for TimescaleDB"; break; fi
  done
  echo "Running migrations on TimescaleDB..."
  npx --yes node-pg-migrate -m migrations-tsdb \
    --check-order false \
    -d postgres://$TSDB_USER:$TSDB_PASSWORD@$TSDB_HOST:$TSDB_PORT/$TSDB_DATABASE up || true
fi

echo "Starting server..."
node src/server.js
