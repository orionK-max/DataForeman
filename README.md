# DataForeman

> **⚠️ Active Development:** This project is currently in beta and under active development. Features and APIs may change.

DataForeman is a containerized stack for collecting industrial telemetry, storing it as time-series data, and exploring it via a modern web UI.

**Repository:** https://github.com/orionK-max/DataForeman
**website:** https://www.DataForeman.app

## Table of Contents

**Helpful Guides:**
- **[Quick Start Guide](QUICK-START.md)** - Step-by-step beginner instructions
- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Solutions to common problems

**For End Users:**
- [What is DataForeman](#what-is-dataforeman)
- [Getting Started](#getting-started)
  - [Windows Installation](#-windows-installation)
  - [Linux Installation](#-linux-installation-docker)
- [Starting and Stopping](#starting-and-stopping-dataforeman)
- [Updating DataForeman](#updating-dataforeman)
- [Troubleshooting](#troubleshooting)
- [Network & Firewall Requirements](#network--firewall-requirements)
- [User Management](#user-management)
- [Data Retention](#data-retention-and-disk-space-management)

**For Developers:**
- [Developer Information](#developer-information) - Technology stack, development setup, and advanced features

---

## Quick Start (TL;DR)

**Linux Users:**
```bash
# Download
cd ~ && git clone https://github.com/orionK-max/DataForeman.git && cd DataForeman

# Setup and Start
./fix-permissions.sh
docker compose up -d

# Access at http://localhost:8080
# Login: admin@example.com / password
```

**Windows Users:** Download installer from [Releases](https://github.com/orionK-max/DataForeman/releases), run it, access at http://localhost:8080

---

## What is DataForeman

DataForeman connects to industrial devices (OPC UA, EtherNet/IP, S7, etc.), collects measurements, and stores them as time-series data. The web interface provides dashboards, charts, and diagnostics for visualizing and analyzing your data.

**Key Components:**
- **Connectivity** - Reads devices and publishes measurements to NATS
- **Core API** - Serves configuration, diagnostics, historian endpoints, and ingests telemetry from NATS
- **Frontend** - React + Material UI web interface with dark/light mode
- **TimescaleDB** - Time-series database with automatic data retention
- **NATS** - Message bus providing buffering and durability

## Getting Started

### Choose Your Platform

DataForeman is available for both **Windows** and **Linux** systems:

#### 🪟 Windows Installation
**Easy one-click installer with automatic updates**

1. **Download** the latest installer from [GitHub Releases](https://github.com/orionK-max/DataForeman/releases)
2. **Run** `DataForeman-Setup-X.X.X.exe` (requires Administrator)
3. **Start** from desktop shortcut or Start Menu
4. **Access** at http://localhost:8080

📖 [Complete Windows Installation Guide](docs/windows-installation.md)

### Requirements:
- **Windows 10/11 (64-bit), 8GB RAM**
- **Docker Desktop** 
- **Internet connection** (only needed for initial installation to download Docker images)

**Notes:**
- If Docker Desktop prompts to update WSL, open PowerShell as Administrator and run:
  ```powershell
  wsl --update
  ```
- For Virtual Machines (VirtualBox, VMware, Parallels, etc.): Enable **virtualization** in VM settings under the "Processors" section (also called VT-x/AMD-V or nested virtualization)

#### 🐧 Linux Installation (Docker)
**Standard Docker Compose deployment**

### Prerequisites
- **Docker** and **Docker Compose** installed
- **Git** installed (to download DataForeman)
- **Internet connection** (only needed for initial installation to download Docker images)

**Note:** After installation, DataForeman works completely offline. Internet is only required to download the software during first-time setup and for updates.

**For Virtual Machines (VirtualBox, Parallels, VMware, etc.):**
- **Network Adapter**: Must use **Bridged Network** mode (not NAT/Shared)
- **Why**: Device discovery uses UDP broadcast packets which cannot traverse NAT
- **Impact**: Without bridged networking, device connections will work but network discovery will fail

### Step-by-Step Installation

**Step 1: Download DataForeman**

Open a terminal and run these commands one at a time:

```bash
# Download DataForeman to your home folder
cd ~
git clone https://github.com/orionK-max/DataForeman.git

# Enter the DataForeman folder
cd DataForeman
```

**Step 2: Configure Environment (Optional)**

**Note:** Files starting with `.` (like `.env.example` and `.gitignore.example`) are hidden by default in Linux file managers. Press `Ctrl+H` to show/hide hidden files, or use `ls -a` in the terminal to list them.

If you want to change the default admin password:

```bash
# Copy the example configuration file
cp .env.example .env

# Edit the file (use nano, vim, or any text editor)
nano .env

# Find the line ADMIN_PASSWORD= and change the password
# Press Ctrl+X, then Y, then Enter to save and exit
```

**Step 3: Set Up Permissions**

```bash
# Run the permission setup script
./fix-permissions.sh
```

**Step 4: Start DataForeman**

```bash
# Start all containers (this will download and build everything - may take several minutes)
docker compose up -d
```

Wait for the command to complete. The first time will take longer as it downloads Docker images and builds containers.

**Step 5: Verify Installation**

Check that all containers are running:

```bash
docker compose ps
```

You should see all services with "Up" status (core, front, db, tsdb, nats, connectivity, rotator). If any show "Exited", wait another minute and check again.

**Step 6: Access DataForeman**

Open your web browser and go to:
```
http://localhost:8080
```

**Accessing from other computers on your network:**

Replace `localhost` with the computer's IP address:
```
http://192.168.1.100:8080
```

Make sure your firewall allows:
- Port **8080** (web interface)
- Port **3000** (backend API - used by the web interface)

**Default Login:**
- Email: `admin@example.com`
- Password: `password` (or the password you set in Step 2)

**Important:** The password from `.env` is only used to create the initial admin account. Once you change your password in the app, it's stored in the database and `.env` is no longer used.

### Updating DataForeman

DataForeman makes it easy to update while **preserving all your data** (databases, configurations, dashboards).

#### Windows Update

**Option 1: Run New Installer (Easiest)**
1. Download latest installer from [GitHub Releases](https://github.com/orionK-max/DataForeman/releases)
2. Run the installer - it automatically preserves your data
3. Done! Your data is safe and the app is updated

**Option 2: Use PowerShell Script**
```powershell
cd "C:\Program Files\DataForeman"
.\windows-installer\update.ps1 -Version v1.2.0
```

#### Linux Update

**Step 1: Find the Latest Version**

Visit https://github.com/orionK-max/DataForeman/releases and find the latest release version (for example: `v1.2.0`)

**Step 2: Update DataForeman**

Open a terminal in DataForeman folder and run these commands one at a time:

```bash
# Stop DataForeman
docker compose down

# Download the new version (replace v1.2.0 with your version)
git fetch --tags
git checkout v1.2.0

# Rebuild and start with the new version
docker compose build
docker compose up -d
```

**Step 3: Wait and Access**

Wait about 1-2 minutes for the update to complete, then access DataForeman at http://localhost:8080

**Important Notes:**
- ✅ Your databases and configurations are safely preserved during the update
- ✅ All your dashboards, devices, and historical data remain intact
- ⏱️ The update process may take a few minutes (downloading and building)
- 📖 Always check the [release notes on GitHub](https://github.com/orionK-max/DataForeman/releases) for important information

**If Something Goes Wrong:**

You can always go back to the previous version.

Open a terminal in DataForeman folder and type:

```bash
docker compose down
git checkout v1.1.0  # Replace with your previous version
docker compose build
docker compose up -d
```

### Starting and Stopping DataForeman

**To Start DataForeman:**

Open a terminal in DataForeman folder and type:

```bash
docker compose up -d
```

Wait about 30 seconds, then access the web interface at http://localhost:8080

**To Stop DataForeman:**

Open a terminal in DataForeman folder and type:

```bash
docker compose down
```

**Note:** Stopping DataForeman shuts down the containers but **keeps all your data safe** (databases, configurations, dashboards, etc.). When you start it again, everything will be exactly as you left it.

**To Check if DataForeman is Running:**

Open a terminal in DataForeman folder and type:

```bash
docker compose ps
```

You should see services like `core`, `front`, `db`, `tsdb`, and `nats` with status "Up".

**To Restart DataForeman:**

Open a terminal in DataForeman folder and type:

```bash
docker compose restart
```

**⚠️ DANGER ZONE - Complete Removal (Delete Everything)**

Only use this if you want to completely uninstall DataForeman and delete ALL data.

Open a terminal in DataForeman folder and type:

```bash
# WARNING: This will permanently delete all databases, configurations, and data!
docker compose down -v
```

## Network & Firewall Requirements

### DataForeman Services (Host Ports)

These are the ports exposed by DataForeman on your host machine:

- **Frontend (Web UI)**: TCP **8080** - Access the web interface
- **Core API**: TCP **3000** - REST API (used internally by frontend)
- **PostgreSQL**: TCP **5432** - Main database (internal only)
- **TimescaleDB**: TCP **5433** - Time-series database (internal only)
- **NATS**: TCP **4222**, **8222** - Message broker (internal only)

### Protocol Drivers (Industrial Device Communication)

DataForeman connects TO industrial devices - **no inbound ports are required** for most protocols. Configure your firewall to allow outbound connections:

#### EtherNet/IP (Allen-Bradley PLCs)
- **Protocol Port**: TCP/UDP **44818** (EtherNet/IP standard)
- **Firewall**: Allow **outbound UDP/TCP port 44818** to PLC IP addresses
- **Discovery**: Uses UDP broadcast for network device scanning
- **Note**: Discovery requires bridged network mode on virtual machines (not NAT)
- **Docker**: No port mapping needed (connectivity service initiates connections)

#### Siemens S7 (S7-300/400/1200/1500)
- **Protocol Port**: TCP **102** (ISO-on-TCP/S7 protocol)
- **Firewall**: Allow **outbound TCP port 102** to PLC IP addresses
- **Docker**: No port mapping needed (connectivity service initiates connections)

#### OPC UA Client
- **Protocol Port**: TCP **4840** (default, varies by server)
- **Firewall**: Allow **outbound TCP port 4840** to OPC UA server addresses (or custom port)
- **Note**: Port may be different depending on the OPC UA server configuration
- **Docker**: No port mapping needed (connectivity service initiates connections)

#### OPC UA Server (Optional - DataForeman as Server)
- **Protocol Port**: TCP **4841** (exposed by DataForeman)
- **Firewall**: Allow **inbound TCP port 4841** if external OPC UA clients need to read from DataForeman
- **Docker**: Port mapping already configured in `docker-compose.yml`
- **Use Case**: Allows other SCADA/HMI systems to read DataForeman tags via OPC UA

### Virtual Machine Configuration

When running DataForeman in a **virtual machine** (VirtualBox, VMware, Parallels, Hyper-V):

- **Network Adapter**: Must use **Bridged Network** mode
- **Why**: Device discovery (EIP) uses UDP broadcast packets which cannot traverse NAT
- **Impact**: Without bridged networking:
  - ✅ Direct device connections will work (with IP address)
  - ❌ Network discovery will fail to find devices

### Firewall Examples

**Windows Firewall (PowerShell - as Administrator):**
```powershell
# Allow DataForeman web UI
New-NetFirewallRule -DisplayName "DataForeman Web UI" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow

# Allow outbound to PLCs (EtherNet/IP)
New-NetFirewallRule -DisplayName "DataForeman EIP" -Direction Outbound -Protocol TCP -RemotePort 44818 -Action Allow
New-NetFirewallRule -DisplayName "DataForeman EIP Discovery" -Direction Outbound -Protocol UDP -RemotePort 44818 -Action Allow

# Allow outbound to PLCs (Siemens S7)
New-NetFirewallRule -DisplayName "DataForeman S7" -Direction Outbound -Protocol TCP -RemotePort 102 -Action Allow

# Allow outbound to OPC UA servers
New-NetFirewallRule -DisplayName "DataForeman OPC UA Client" -Direction Outbound -Protocol TCP -RemotePort 4840 -Action Allow
```

**Linux Firewall (ufw):**
```bash
# Allow DataForeman web UI
sudo ufw allow 8080/tcp comment 'DataForeman Web UI'

# Allow outbound is default in ufw, but if you have restrictive rules:
sudo ufw allow out 44818 comment 'DataForeman EIP'
sudo ufw allow out 102/tcp comment 'DataForeman S7'
sudo ufw allow out 4840/tcp comment 'DataForeman OPC UA'
```

## User Management

### Authentication

- **Initial Admin**: `admin@example.com` (password set via `ADMIN_PASSWORD` in `.env`)
- **Session Duration**: 14 days with automatic token refresh
- **Password Reset**: Available from Admin page

### Permissions

DataForeman uses a granular permission system where administrators control user access at a feature and operation level.

**Key Features:**
- Separate permissions for Create, Read, Update, Delete operations
- Permissions organized by feature (Dashboards, Connectivity, Chart Composer, Diagnostics)
- Easy-to-use Admin UI for managing permissions
- Interface adapts to show only permitted features

**Managing User Permissions:**

1. Login as Admin
2. Navigate to Users (click user icon → Users)
3. Select user from list
4. Scroll to "User Permissions" section
5. Use Quick Presets:
   - **No Access**: Removes all permissions
   - **Read Only**: View-only access to all features
   - **Power User**: Read + Update permissions
   - **Full Access**: All CRUD permissions
6. Save changes (user must logout/login to see changes)

**Supported Features:**
- Core: Dashboards, Chart Composer
- Connectivity: Devices, Tags, Poll Groups, Units of Measure
- Diagnostics: System, Capacity, Logs, Network
- Admin: Users, Permissions, Jobs, Configuration

## Troubleshooting

**📖 For detailed troubleshooting with more solutions, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)**

### Common Issues and Solutions

#### "Cannot Access http://localhost:8080"

**Check if containers are running:**

Open a terminal in DataForeman folder and type:

```bash
docker compose ps
```

If containers are not running, start them:
```bash
docker compose up -d
```

If containers show "Exited" or error status, check the logs:
```bash
docker compose logs
```

#### Permission Errors on Startup

**Symptom:** Containers show "Permission denied" when trying to write log files.

**Solution:**

Open a terminal in DataForeman folder and type:

```bash
./fix-permissions.sh
docker compose restart
```

**Why this happens:** The log directories need specific permissions for the containers to write log files.

#### "Out of Memory" or Containers Keep Restarting

**Solution:** DataForeman needs at least 4GB of RAM to run smoothly. If you're on a VM or system with limited RAM:

1. Close other applications
2. Increase VM memory allocation (if using a VM)
3. Check Docker memory limits: `docker stats`

#### Database Won't Start After OS Restart

**Symptom:** Containers show permission errors for PostgreSQL logs:
```
FATAL: could not open log file "/var/log/postgresql/postgres-YYYY-MM-DD_HHMM": Permission denied
```

**Solution:** Run the fix-permissions script:

Open a terminal in DataForeman folder and type:

```bash
./fix-permissions.sh
docker compose up -d
```

#### Update Failed or Containers Won't Start After Update

**Solution:** Rebuild everything from scratch.

Open a terminal in DataForeman folder and type:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

If problems persist, check if you're on a valid version tag:
```bash
git describe --tags
```

#### Still Having Issues?

1. **Check logs for errors:**
   ```bash
   docker compose logs core
   docker compose logs front
   ```

2. **Restart everything:**
   ```bash
   docker compose down
   docker compose up -d
   ```

3. **Ask for help:**
   - Create an issue on [GitHub](https://github.com/orionK-max/DataForeman/issues)
   - Include your logs and error messages

## Data Retention and Disk Space Management

DataForeman automatically manages disk space by compressing and deleting old data. **By default, data is kept forever** until you configure a retention policy.

### Setting Up Data Retention

1. **Log in** to DataForeman as admin
2. **Navigate to:** Diagnostic → Capacity → Retention Policy
3. **Configure settings:**
   - **Retention Period**: How long to keep data (suggested: 30 days)
   - **Compression After**: When to compress old data (suggested: 7 days)
4. **Click Save** to activate

### How It Works

- **Fresh data** (0-7 days): Stored normally, fast access
- **Compressed data** (7-30 days): Automatically compressed to save ~75% disk space
- **Old data** (30+ days): Automatically deleted to free up space

### Monitoring Disk Usage

View your disk usage at: **Diagnostic → Capacity → Retention Policy**

This shows:
- How much disk space is being used
- How much data will be deleted
- Compression savings

---

## Network & Firewall Requirements

---

# DEVELOPER INFORMATION

**⚠️ The sections below are for developers and advanced users only.**

If you're a regular user just wanting to use DataForeman, you can stop reading here. Everything above is all you need!

---

## Developer Information

### Prerequisites for Development

- **Docker** and **Docker Compose** (for running services)
- **Node.js 22** (for local development)
- **Git** (for version control)

### Technology Stack

- **Runtime**: Node.js 22 (ESM only)
- **Backend**: Fastify, jose (JWT), argon2, pino logging
- **Database**: PostgreSQL 16 + TimescaleDB, node-pg-migrate
- **Frontend**: React 18 + Material UI v5 + React Router v6 + Vite
- **Messaging**: NATS with JetStream
- **Containers**: Docker Compose (postgres, nats, tsdb, core, connectivity, rotator)

### Project Structure

- **front**: React + Material UI frontend (port 5174)
- **core**: Fastify API (port 3000) with integrated telemetry ingestion
- **connectivity**: Protocol drivers and device connectivity API
- **ops**: Utilities, scripts, and operational tools

### Development Commands

**Note:** These commands are for **active development only**. Regular users should use `docker compose up -d` instead.

These commands run parts of DataForeman on your host machine (outside Docker) for faster development:

| Command | Description |
|---------|-------------|
| `npm start` | Start frontend (local) + backend (local) for development |
| `npm run start:rebuild` | Rebuild containers and start everything |
| `npm run dev` | Same as `npm start` |
| `npm run dev:front` | Start only frontend locally (port 5174) |
| `npm run dev:core` | Start only backend locally |
| `npm run start:local` | Run Core locally with DB/NATS in Docker |
| `npm run start:caddy` | Start with Caddy TLS reverse proxy |

**Development vs Production:**
- **Development** (`npm start`): Runs on port 5174, hot-reload enabled, not containerized
- **Production** (`docker compose up -d`): Runs on port 8080, fully containerized, more stable

### Environment Variables

See `.env.example` for all variables. Key settings:

**Core:**
- `LOG_FILE`, `LOG_LEVEL` - Logging configuration
- `AUTH_DEV_TOKEN` - Bypass permission checks (development only)
- `JWT_SECRET` - JWT signing secret
- `ADMIN_PASSWORD` - Initial admin password

**Logging:**
- `LOG_ROTATE_PERIOD_MINUTES` - Rotation period (default 1440 = 24h)
- `LOG_RETENTION_DAYS` - Days to keep logs (default 14)
- `LOG_CONSOLE` - Enable console logging (default 0)

**Databases:**
- `PG*` - Core PostgreSQL database
- `TSDB_*` - TimescaleDB settings

### Docker Containers

- **db** (postgres:16-alpine): Primary database, exposes 5432
- **tsdb** (timescale/timescaledb): Time-series store, exposes 5433
- **nats** (nats:2-alpine): Message bus, exposes 4222 (client), 8222 (monitoring)
- **core** (dataforeman-core): API service with integrated telemetry ingestion, exposes 3000
- **connectivity** (node:22-alpine): Protocol drivers
- **rotator** (node:22-alpine): Log rotation daemon
- **caddy** (caddy:2-alpine): Optional TLS reverse proxy

### Logging System

All components write logs to `./logs/<component>/<component>.current` symlinks. The rotator daemon periodically switches symlinks to time-stamped files.

**Log Locations:**
- Core: `logs/core/core.current`
- NATS: `logs/nats/nats.current`
- Postgres/TSDB: `logs/postgres/*.csv`
- Connectivity: `logs/connectivity/connectivity.current`
- Ops/Rotator: `logs/ops/ops.current`

**View Logs:**
```bash
# Follow current log
tail -f logs/core/core.current

# View via API (admin only)
curl http://localhost:3000/logs/read?component=core&limit=100
```

### Permission System Development

**Adding a New Feature:**

1. Define feature in `core/src/constants/features.js`
2. Protect route with permission middleware:
   ```javascript
   app.post('/api/reports', {
     preHandler: [
       app.authenticate,
       app.permissions.requirePermission('reports', 'create')
     ]
   }, handler);
   ```
3. Add permission checks to UI:
   ```javascript
   const { can } = usePermissions();
   
   {can('reports', 'create') && (
     <Button>Create Report</Button>
   )}
   ```

**Validation:**

DataForeman automatically validates all API routes have proper permission checks:

```bash
# Run validation
node ops/validate-permissions.js

# Run with detailed output
node ops/validate-permissions.js --verbose
```

Validation runs automatically during `npm start` and `npm run start:rebuild`.

**Developer Documentation:**
- **[API Registry](docs/api-registry.md)** - Complete endpoint reference
- **[Developer Guide](docs/permission-system-developer-guide.md)** - Permission system guide
- **[Testing Checklist](docs/permission-system-testing-checklist.md)** - Testing procedures

### Database Migrations

Migrations are located in `core/migrations/`. Use node-pg-migrate inside the core container.

**Note:** The first user created automatically receives full administrative permissions. Set `AUTH_DEV_TOKEN=1` to bypass permission checks during development.

### Code Quality

- ESLint + Prettier configured at root
- Automatic permission validation on startup
- Frontend: Vite for fast builds and HMR
- Backend: Fastify with automatic route validation

---

## Legal
- **[Third Party Notices](THIRD-PARTY-NOTICES.md)** - Open source licenses and attributions

