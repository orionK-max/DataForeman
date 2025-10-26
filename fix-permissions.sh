#!/bin/bash
# Fix permissions for DataForeman after OS restart
# This script ensures PostgreSQL containers (running as UID 70) can write log files

set -e  # Exit on error

echo "════════════════════════════════════════════════════════════"
echo "  DataForeman Permission Fix"
echo "════════════════════════════════════════════════════════════"
echo ""

# Fix var directory (license file)
echo "[1/3] Fixing var/ directory permissions..."
sudo chown -R parallels:parallels /home/parallels/Documents/DataForeman/var
chmod 755 /home/parallels/Documents/DataForeman/var
if [ -f /home/parallels/Documents/DataForeman/var/license.json ]; then
  chmod 644 /home/parallels/Documents/DataForeman/var/license.json
fi
echo "      ✓ var/ directory fixed"

# Fix logs directory
echo "[2/3] Fixing logs/ directory permissions..."
sudo chown -R parallels:parallels /home/parallels/Documents/DataForeman/logs
sudo chmod -R 755 /home/parallels/Documents/DataForeman/logs
echo "      ✓ logs/ directory fixed"

# Allow Postgres/Timescale containers to write CSV logs into bind mount
echo "[3/3] Setting postgres log directory to world-writable (0777)..."
mkdir -p /home/parallels/Documents/DataForeman/logs/postgres
chmod 0777 /home/parallels/Documents/DataForeman/logs/postgres
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
