#!/usr/bin/env sh
set -e

# Helper function to create database if it doesn't exist
create_database_if_not_exists() {
  local host=$1
  local port=$2
  local user=$3
  local password=$4
  local dbname=$5
  
  echo "Ensuring database '$dbname' exists..."
  
  # Retry up to 10 times with 2 second delays
  local max_attempts=10
  local attempt=1
  
  while [ $attempt -le $max_attempts ]; do
    if PGPASSWORD=$password psql -h $host -p $port -U $user -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$dbname'" 2>&1 | grep -q 1; then
      echo "Database '$dbname' exists."
      return 0
    fi
    
    if PGPASSWORD=$password psql -h $host -p $port -U $user -d postgres -c "CREATE DATABASE $dbname" 2>&1; then
      echo "Database '$dbname' created."
      return 0
    fi
    
    echo "  attempt $attempt failed, retrying..."
    attempt=$((attempt+1))
    sleep 2
  done
  
  echo "Failed to create database after $max_attempts attempts"
  return 1
}

if [ -n "${PGHOST}" ]; then
  echo "Waiting for Postgres at $PGHOST:$PGPORT..."
  i=1
  until node -e "const net=require('net');const s=net.connect(process.env.PGPORT, process.env.PGHOST, ()=>{s.end();process.exit(0)}); s.on('error',()=>process.exit(1))" >/dev/null 2>&1; do
    echo "  attempt $i..."; i=$((i+1)); sleep 1;
    if [ "$i" -gt 60 ]; then echo "Giving up waiting for Postgres"; break; fi
  done
  
  # Create database if it doesn't exist
  create_database_if_not_exists "$PGHOST" "$PGPORT" "$PGUSER" "$PGPASSWORD" "$PGDATABASE"
  
  echo "Running migrations on main database..."
  npx --yes node-pg-migrate -m migrations \
    --check-order false \
    -d postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE up
fi

# Wait for and migrate TimescaleDB
if [ -n "${TSDB_HOST}" ]; then
  echo "Waiting for TimescaleDB at $TSDB_HOST:$TSDB_PORT..."
  i=1
  until node -e "const net=require('net');const s=net.connect(process.env.TSDB_PORT, process.env.TSDB_HOST, ()=>{s.end();process.exit(0)}); s.on('error',()=>process.exit(1))" >/dev/null 2>&1; do
    echo "  attempt $i..."; i=$((i+1)); sleep 1;
    if [ "$i" -gt 60 ]; then echo "Giving up waiting for TimescaleDB"; break; fi
  done
  
  # Create database if it doesn't exist
  create_database_if_not_exists "$TSDB_HOST" "$TSDB_PORT" "$TSDB_USER" "$TSDB_PASSWORD" "$TSDB_DATABASE"
  
  # Create TimescaleDB extension
  echo "Ensuring TimescaleDB extension is installed..."
  PGPASSWORD=$TSDB_PASSWORD psql -h $TSDB_HOST -p $TSDB_PORT -U $TSDB_USER -d $TSDB_DATABASE -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
  
  echo "Running migrations on TimescaleDB..."
  # Set PG* environment variables for TimescaleDB connection
  PGHOST=$TSDB_HOST PGPORT=$TSDB_PORT PGUSER=$TSDB_USER PGPASSWORD=$TSDB_PASSWORD PGDATABASE=$TSDB_DATABASE \
   npx --yes node-pg-migrate -m migrations-tsdb \
    --check-order false \
    --migrations-table pgmigrations_tsdb \
    -d postgres://$TSDB_USER:$TSDB_PASSWORD@$TSDB_HOST:$TSDB_PORT/$TSDB_DATABASE up
fi

echo "Starting server..."
node src/server.js
