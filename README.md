# DataForeman

DataForeman is a containerized stack for collecting industrial telemetry, storing it as time-series data, and exploring it via a modern web UI.

**Repository:** https://github.com/orionK-max/DataForeman

## What is DataForeman

DataForeman connects to industrial devices (OPC UA, EtherNet/IP, S7, etc.), collects measurements, and stores them as time-series data. The web interface provides dashboards, charts, and diagnostics for visualizing and analyzing your data.

**Key Components:**
- **Connectivity** - Reads devices and publishes measurements to NATS
- **Ingestor** - Subscribes to NATS and writes batches to TimescaleDB
- **Core API** - Serves configuration, diagnostics, and historian endpoints
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

**Requirements:** Docker Desktop, Windows 10/11 (64-bit), 8GB RAM

**Notes:**
- If Docker Desktop prompts to update WSL, open PowerShell as Administrator and run:
  ```powershell
  wsl --update
  ```
- For Virtual Machines (VirtualBox, VMware, Parallels, etc.): Enable **virtualization** in VM settings under the "Processors" section (also called VT-x/AMD-V or nested virtualization)

#### 🐧 Linux Installation (Docker)
**Standard Docker Compose deployment**

### Prerequisites
- Docker and Docker Compose
- Node.js 22 (for local development)

**Initial Setup:**
```bash
# Clone and set up gitignore
git clone https://github.com/orionK-max/DataForeman.git
cd DataForeman
cp .gitignore.example .gitignore  # Create your local .gitignore
```

**For Virtual Machines (VirtualBox, Parallels, VMware, etc.):**
- **Network Adapter**: Must use **Bridged Network** mode (not NAT/Shared)
- **Why**: Device discovery uses UDP broadcast packets which cannot traverse NAT
- **Impact**: Without bridged networking, device connections will work but network discovery will fail

### Installation (Linux)

1. Copy `.env.example` to `.env` and adjust if needed
2. Run `./fix-permissions.sh` to set up log directory permissions
3. Start the stack:

```bash
npm start
```

**Access:**
- Frontend: http://localhost:5174
- Core API: http://localhost:3000

**Default Login:**
- Email: `admin@example.com`
- Password: Set via `ADMIN_PASSWORD` in `.env` (default: see `.env.example`)

### Updating

DataForeman makes it easy to update while **preserving all your data** (databases, configurations, dashboards):

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

**Step 1: Find the version you want to install**

Visit https://github.com/orionK-max/DataForeman/releases and find the latest release. Copy the release name (for example: `v1.2.0`)

**Step 2: Update your installation**

Open a terminal in your DataForeman folder and run these commands one at a time:

```bash
# Stop DataForeman
docker compose down

# Download the new version (replace v1.2.0 with the release name you copied)
git fetch --tags
git checkout v1.2.0

# Install and start the new version
npm run start:rebuild
```

**Note:** 
- Your databases and configurations are safely preserved during the update
- The update process may take a few minutes
- Always check the release notes on GitHub for any important information about the update

### Stopping

```bash
# Stop containers (preserves all data in volumes)
docker compose down
```

**Note:** This command stops and removes containers but **preserves all data** in Docker volumes (databases, configurations, etc.).

**To completely remove everything including data** (use with caution):
```bash
# WARNING: This will delete all databases and data!
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

### Containers Won't Start - Permission Denied (Windows)

**Symptom:** After installation or OS restart, containers stop with "Permission denied" errors when trying to write to log directories.

**Automatic Fix:** The start script automatically checks and fixes permissions. Just restart DataForeman:
- Use the Start Menu shortcut, or
- Run `windows-installer\start-dataforeman.bat`

**Manual Fix (if needed):**
1. Open the Start Menu
2. Find DataForeman → **Fix Permissions**
3. Restart DataForeman

**Or via PowerShell (as Administrator):**
```powershell
cd "C:\Program Files\DataForeman"
.\windows-installer\fix-permissions.ps1
.\windows-installer\start-dataforeman.bat
```

**Why this happens:** Docker Desktop uses WSL2, and directory permissions sometimes need to be reset for containers (running as different users) to write log files.

**Note:** The start script now automatically checks permissions before starting containers, so this should rarely be needed.

### Database Won't Start After OS Restart (Linux)

**Symptom:** Containers show "Permission denied" when trying to write log files:
```
FATAL: could not open log file "/var/log/postgresql/postgres-YYYY-MM-DD_HHMM": Permission denied
```

**Solution:** Run the fix-permissions script:
```bash
./fix-permissions.sh
docker compose up -d
```

**Why this happens:** PostgreSQL containers run as UID 70 and need world-writable permissions on the `logs/postgres/` directory to create log files. After OS restart, directory permissions may revert to defaults.

**Prevention:** Add `./fix-permissions.sh` to your startup routine or create a systemd service to run it automatically.

### Data Retention

DataForeman uses TimescaleDB's automatic data retention policies to manage disk space for time-series data.

**Initial Setup:**

By default, **no retention policy is active**. You must configure retention settings via the UI:

1. Navigate to **Diagnostic → Capacity → Retention Policy**
2. Configure settings (suggested defaults):
   - **Chunk Interval**: 1 day (not configurable via UI)
   - **Retention Period**: 30 days
   - **Compression After**: 7 days
3. Click **Save** to activate the retention policy

**How It Works:**

- Data is stored in time-based chunks (1-day chunks by default)
- Older chunks are compressed after 7 days to save disk space
- Retention policy automatically drops chunks older than 30 days
- Cleanup job runs periodically to remove old data
- **Important**: Chunk interval must be smaller than retention period for the policy to work

**Managing Retention:**

All retention settings are managed via **Diagnostic → Capacity → Retention Policy** in the UI. This interface allows you to:
- Set retention period
- Enable/disable automatic cleanup
- View current retention status
- Monitor disk space usage

---

## Developer Information

### Technology Stack

- **Runtime**: Node.js 22 (ESM only)
- **Backend**: Fastify, jose (JWT), argon2, pino logging
- **Database**: PostgreSQL 16 + TimescaleDB, node-pg-migrate
- **Frontend**: React 18 + Material UI v5 + React Router v6 + Vite
- **Messaging**: NATS with JetStream
- **Containers**: Docker Compose (postgres, nats, tsdb, core, connectivity, ingestor, rotator)

### Project Structure

- **front**: React + Material UI frontend (port 5174)
- **core**: Fastify API (port 3000)
- **connectivity**: Protocol drivers and device connectivity API
- **ingestor**: NATS→TimescaleDB ingestion service
- **ops**: Utilities, scripts, and operational tools

### Development Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start frontend + backend |
| `npm run start:rebuild` | Rebuild and start everything |
| `npm run dev` | Same as `npm start` |
| `npm run dev:front` | Start only frontend |
| `npm run dev:core` | Start only backend |
| `npm run start:local` | Run Core locally (DB/NATS in Docker) |
| `npm run start:caddy` | Start with Caddy TLS reverse proxy |

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
- **core** (dataforeman-core): API service, exposes 3000
- **connectivity** (node:22-alpine): Protocol drivers
- **ingestor** (node:22-alpine): NATS→TimescaleDB ingestion
- **rotator** (node:22-alpine): Log rotation daemon
- **caddy** (caddy:2-alpine): Optional TLS reverse proxy

### Logging System

All components write logs to `./logs/<component>/<component>.current` symlinks. The rotator daemon periodically switches symlinks to time-stamped files.

**Log Locations:**
- Core: `logs/core/core.current`
- NATS: `logs/nats/nats.current`
- Postgres/TSDB: `logs/postgres/*.csv`
- Ingestor: `logs/ingestor/ingestor.current`
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

