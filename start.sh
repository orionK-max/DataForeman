#!/usr/bin/env bash
# DataForeman start script for end-user (no-clone) installs.
# Developers: use 'npm start' or 'npm run dev:rebuild' instead.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# Ensure nanomq config template + entrypoint are present before starting
# (broker mounts ./nanomq/ files directly; see docker-compose.yml)
mkdir -p nanomq
if [[ ! -f nanomq/nanomq.conf.template ]]; then
  echo "Downloading nanomq/nanomq.conf.template..."
  curl -fsSL -o nanomq/nanomq.conf.template https://raw.githubusercontent.com/orionK-max/DataForeman/main/nanomq/nanomq.conf.template
fi
if [[ ! -f nanomq/docker-entrypoint.sh ]]; then
  echo "Downloading nanomq/docker-entrypoint.sh..."
  curl -fsSL -o nanomq/docker-entrypoint.sh https://raw.githubusercontent.com/orionK-max/DataForeman/main/nanomq/docker-entrypoint.sh
  chmod +x nanomq/docker-entrypoint.sh
fi

# Fix directory permissions so containers can write logs
if [[ -f fix-permissions.sh ]]; then
  bash fix-permissions.sh
else
  # Minimal fallback when fix-permissions.sh is not present (pre-built image installs)
  sudo mkdir -p logs var
  # Create all log subdirectories
  for dir in core connectivity front nats ops ingestor broker tsdb; do
    sudo mkdir -p "logs/$dir"
    sudo chmod 0755 "logs/$dir"
  done
  # Postgres runs as UID 70 — must be world-writable
  sudo mkdir -p logs/postgres
  sudo chmod 0777 logs/postgres
fi

# Apply Linux host-networking override for EIP autodiscovery (first run only)
if [[ "$(uname -s)" == "Linux" && ! -f docker-compose.override.yml && -f docker-compose.override.yml.linux ]]; then
  echo "Applying Linux host networking override for EIP autodiscovery..."
  cp docker-compose.override.yml.linux docker-compose.override.yml
fi

echo "Starting DataForeman..."
docker compose up -d

# Auto-start any previously installed extension services
if [[ -f var/extensions.env ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^EXTENSION_(.+)_ENABLED$ ]] && [[ "$value" == "true" ]] || continue
    profile="${BASH_REMATCH[1],,}"
    echo "Starting extension: $profile"
    docker compose --env-file var/extensions.env --profile "$profile" up -d "$profile" || echo "⚠️  Failed to start extension: $profile"
  done < <(grep -E '^EXTENSION_[A-Z0-9_]+_ENABLED=true' var/extensions.env 2>/dev/null)
fi

echo ""
echo "DataForeman is running at http://localhost:8080"
echo "Login: admin@example.com / (password from .env)"
