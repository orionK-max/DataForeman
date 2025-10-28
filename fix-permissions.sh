#!/bin/bash
# Fix permissions for DataForeman after OS restart
# This script ensures PostgreSQL containers (running as UID 70) can write log files

set -e  # Exit on error

# Determine the current user and group
CURRENT_USER="${SUDO_USER:-$USER}"
CURRENT_GROUP=$(id -gn "$CURRENT_USER")

# Determine the script's directory (DataForeman root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "════════════════════════════════════════════════════════════"
echo "  DataForeman Permission Fix"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  User:  $CURRENT_USER:$CURRENT_GROUP"
echo "  Path:  $SCRIPT_DIR"
echo ""

# Fix var directory (license file)
echo "[1/3] Fixing var/ directory permissions..."
mkdir -p "$SCRIPT_DIR/var"
sudo chown -R "$CURRENT_USER:$CURRENT_GROUP" "$SCRIPT_DIR/var"
chmod 755 "$SCRIPT_DIR/var"
if [ -f "$SCRIPT_DIR/var/license.json" ]; then
  chmod 644 "$SCRIPT_DIR/var/license.json"
fi
echo "      ✓ var/ directory fixed"

# Fix logs directory
echo "[2/3] Fixing logs/ directory permissions..."
mkdir -p "$SCRIPT_DIR/logs"
sudo chown -R "$CURRENT_USER:$CURRENT_GROUP" "$SCRIPT_DIR/logs"
sudo chmod -R 755 "$SCRIPT_DIR/logs"
echo "      ✓ logs/ directory fixed"

# Allow Postgres/Timescale containers to write CSV logs into bind mount
echo "[3/3] Setting postgres log directory to world-writable (0777)..."
mkdir -p "$SCRIPT_DIR/logs/postgres"
chmod 0777 "$SCRIPT_DIR/logs/postgres"
echo "      ✓ logs/postgres/ set to 0777 (required for UID 70 container)"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ✓ Permissions fixed successfully!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "You can now start DataForeman with:"
echo "  docker compose up -d"
echo ""
echo "Or use npm scripts:"
echo "  npm start              # Start frontend + backend"
echo "  npm run start:rebuild  # Rebuild and start everything"
echo ""
