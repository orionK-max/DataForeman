# Windows Installation Guide

Complete guide for installing, updating, and managing DataForeman on Windows.

## Table of Contents
- [System Requirements](#system-requirements)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [First Time Setup](#first-time-setup)
- [Updating DataForeman](#updating-dataforeman)
- [Managing DataForeman](#managing-dataforeman)
- [Troubleshooting](#troubleshooting)
- [Uninstallation](#uninstallation)

---

## System Requirements

### Minimum Requirements
- **OS**: Windows 10 (64-bit) version 1903 or higher, or Windows 11
- **RAM**: 8GB
- **Disk Space**: 20GB free space
- **CPU**: 64-bit processor with virtualization support
- **Network**: Internet connection for installation and updates only. Not required for general operation

### Recommended Requirements
- **RAM**: 16GB or more
- **Disk Space**: 50GB SSD
- **CPU**: Multi-core processor (4+ cores)

---

## Prerequisites

### 1. Install Docker Desktop

DataForeman requires Docker Desktop to run its containerized services.

**Installation Steps:**

1. **Download Docker Desktop**
   - Visit: https://www.docker.com/products/docker-desktop/
   - Click "Download for Windows"

2. **Run the Installer**
   - Double-click `Docker Desktop Installer.exe`
   - Follow the installation wizard
   - When prompted, ensure **"Use WSL 2 instead of Hyper-V"** is checked (recommended)

3. **Restart Your Computer**
   - Docker requires a restart to complete installation

4. **Start Docker Desktop**
   - Launch Docker Desktop from the Start Menu
   - Wait for the Docker icon in the system tray to show "Docker Desktop is running"
   - You may need to accept the Docker Service Agreement

5. **Verify Installation (optional)**
   ```powershell
   docker --version
   docker ps
   ```
   Both commands should run without errors.

**Troubleshooting Docker Installation:**
- If you see "WSL 2 installation is incomplete", follow the prompts to install the WSL 2 kernel update
- Ensure virtualization is enabled in your BIOS/UEFI settings
- See: https://docs.docker.com/desktop/troubleshoot/overview/

---

## Installation

### Method 1: Using the Windows Installer (Recommended)

1. **Download the Installer**
   - Go to: https://github.com/orionK-max/DataForeman/releases
   - Download the latest `DataForeman-Setup-X.X.X.exe`

2. **Run the Installer**
   - Right-click the downloaded file
   - Select "Run as Administrator"
   - If Windows SmartScreen appears, click "More info" → "Run anyway"

3. **Follow the Installation Wizard**
   - Review and accept the license agreement
   - Choose installation directory (default: `C:\Program Files\DataForeman`)
   - **Set Administrator Credentials:**
     - Enter email address (e.g., `admin@yourcompany.com`)
     - Create a strong password (minimum 6 characters)
     - Confirm password
   - Select components (all recommended)
   - Choose whether to create desktop and Start Menu shortcuts

4. **Complete Installation**
   - The installer will:
     - Copy application files
     - Create configuration files with your admin credentials
     - Set up log directories
     - Create shortcuts
     - Check for Docker Desktop
   
5. **Launch DataForeman**
   - Check "Launch DataForeman" at the end of installation, OR
   - Use the desktop shortcut, OR
   - Start Menu → DataForeman → Start DataForeman

### Method 2: Manual Installation (Advanced Users)

1. **Clone the Repository**
   ```powershell
   git clone https://github.com/orionK-max/DataForeman.git
   cd DataForeman
   ```

2. **Checkout Specific Version**
   ```powershell
   git checkout v1.0.0  # Replace with desired version
   ```

3. **Create Environment File**
   ```powershell
   Copy-Item .env.example .env
   ```

4. **Edit Configuration** (Optional)
   ```powershell
   notepad .env
   ```
   Update passwords and settings as needed.

5. **Start DataForeman**
   ```powershell
   .\windows-installer\start-dataforeman.bat
   ```

---

## First Time Setup

### 1. Access the Web Interface

Once DataForeman is running, open your web browser and navigate to:
- **Frontend**: http://localhost:8080
- **API**: http://localhost:3000

### 2. Initial Login

Use the administrator credentials you set during installation:
- **Email**: The email address you entered during installation
- **Password**: The password you created during installation

**Note**: If you need to reset these credentials, edit the `.env` file in `C:\Program Files\DataForeman\.env`

### 3. Configure Settings

1. **Change Admin Password**
   - Navigate to Admin → Users
   - Edit admin user
   - Set a strong password

2. **Review Configuration**
   - Edit `C:\Program Files\DataForeman\.env` if needed
   - Restart DataForeman after any configuration changes

3. **Add Devices**
   - Go to Devices → Add Device
   - Configure your OPC UA, EtherNet/IP, or other industrial devices

### 4. Verify Services

Check that all services are running:
```powershell
cd "C:\Program Files\DataForeman"
docker-compose ps
```

You should see:
- `db` (PostgreSQL)
- `tsdb` (TimescaleDB)
- `nats` (Message Queue)
- `core` (API Server)
- `connectivity` (Device Driver)
- `front` (Web Interface)

---

## Updating DataForeman

### Automatic Update (Easiest)

1. **Download New Installer**
   - Visit: https://github.com/orionK-max/DataForeman/releases
   - Download the latest installer

2. **Run the Installer**
   - Simply run the new installer
   - It will detect the existing installation
   - Your data, configurations, and databases will be **automatically preserved**

3. **Restart DataForeman**
   - Services will restart automatically with the new version

### Manual Update Using PowerShell Script

1. **Open PowerShell as Administrator**
   ```powershell
   cd "C:\Program Files\DataForeman"
   ```

2. **Run the Update Script**
   ```powershell
   .\windows-installer\update.ps1 -Version v1.2.0
   ```
   Replace `v1.2.0` with your desired version.

3. **The Script Will:**
   - Check Docker is running
   - Stop current services
   - Verify your data volumes are safe
   - Download the new version
   - Rebuild containers
   - Start the updated version

4. **Verify Update**
   - Open http://localhost:8080
   - Check the version in the footer or about page

### Manual Update Using Git

For advanced users:

```powershell
# Stop services
docker-compose down

# Update code
git fetch --tags
git checkout v1.2.0

# Rebuild and start
docker-compose build
docker-compose up -d
```

### What Gets Preserved During Updates

✅ **Automatically Preserved:**
- All databases (PostgreSQL, TimescaleDB)
- User accounts and permissions
- Device configurations
- Historical telemetry data
- Dashboards and visualizations
- `.env` configuration file

❌ **Will Be Updated:**
- Application code
- Docker images
- Default configurations (your custom `.env` is kept)

---

## Managing DataForeman

### Starting DataForeman

**Option 1: Desktop Shortcut**
- Double-click the "DataForeman" icon on your desktop

**Option 2: Start Menu**
- Start Menu → DataForeman → Start DataForeman

**Option 3: Command Line**
```powershell
cd "C:\Program Files\DataForeman"
.\windows-installer\start-dataforeman.bat
```

### Stopping DataForeman

**Option 1: Start Menu**
- Start Menu → DataForeman → Stop DataForeman

**Option 2: Command Line**
```powershell
cd "C:\Program Files\DataForeman"
.\windows-installer\stop-dataforeman.bat
```

**Option 3: Docker Command**
```powershell
cd "C:\Program Files\DataForeman"
docker-compose down
```

### Checking Status

**Option 1: Status Script**
```powershell
cd "C:\Program Files\DataForeman"
.\windows-installer\status-dataforeman.bat
```

**Option 2: Docker Command**
```powershell
cd "C:\Program Files\DataForeman"
docker-compose ps
```

### Viewing Logs

**All Services:**
```powershell
cd "C:\Program Files\DataForeman"
docker-compose logs
```

**Specific Service:**
```powershell
docker-compose logs core
docker-compose logs connectivity
docker-compose logs front
```

**Follow Logs in Real-Time:**
```powershell
docker-compose logs -f
```

**Log Files on Disk:**
Logs are also written to:
```
C:\Program Files\DataForeman\logs\
├── core\
├── connectivity\
├── front\
├── postgres\
└── tsdb\
```

### Editing Configuration

1. **Stop DataForeman**
2. **Edit `.env` file:**
   ```powershell
   notepad "C:\Program Files\DataForeman\.env"
   ```
3. **Save changes**
4. **Start DataForeman**

Common settings:
```env
# Admin password
ADMIN_PASSWORD=your-strong-password

# Ports
PORT=3000
PGPORT=5432
TSDB_PORT=5433

# Logging
LOG_LEVEL=info
LOG_RETENTION_DAYS=14

# Database passwords
PGPASSWORD=your-postgres-password
TSDB_PASSWORD=your-tsdb-password
```

---

## Troubleshooting

### DataForeman Won't Start

**Check Docker is Running:**
```powershell
docker ps
```
If you see an error, start Docker Desktop from the Start Menu.

**Check Ports Are Available:**
```powershell
netstat -ano | findstr "8080"
netstat -ano | findstr "3000"
```
If ports are in use, either stop the conflicting service or change DataForeman ports in `.env`.

**Check Docker Logs:**
```powershell
cd "C:\Program Files\DataForeman"
docker-compose logs
```

### Services Keep Restarting

**Check for Errors:**
```powershell
docker-compose logs core
```

**Common Issues:**
- Database connection failures → Check database containers are running
- Port conflicts → Change ports in `.env`
- Missing environment variables → Verify `.env` file exists

### Database Connection Errors

**Verify Database Containers:**
```powershell
docker-compose ps db tsdb
```

**Restart Database Services:**
```powershell
docker-compose restart db tsdb
```

**Check Database Logs:**
```powershell
docker-compose logs db
docker-compose logs tsdb
```

### Web Interface Not Loading

1. **Verify Frontend Container:**
   ```powershell
   docker-compose ps front
   ```

2. **Check Frontend Logs:**
   ```powershell
   docker-compose logs front
   ```

3. **Try Different Browser:**
   - Clear cache and cookies
   - Try incognito/private mode
   - Try a different browser

4. **Check Core API:**
   ```powershell
   curl http://localhost:3000/health
   ```

### Update Failed

**Rollback to Previous Version:**
```powershell
cd "C:\Program Files\DataForeman"
docker-compose down
git checkout v1.0.0  # Replace with previous working version
docker-compose up -d
```

**Check Update Logs:**
Look for error messages during the update process.

### Docker Desktop Issues

**Restart Docker Desktop:**
1. Right-click Docker icon in system tray
2. Select "Restart Docker Desktop"
3. Wait for Docker to fully restart

**Reset Docker Desktop:** (Last Resort)
1. Docker Desktop → Settings → Troubleshoot
2. Click "Reset to factory defaults"
3. **⚠️ Warning**: This will remove all containers and volumes!

### Performance Issues

**Check Resource Usage:**
```powershell
docker stats
```

**Increase Docker Resources:**
1. Docker Desktop → Settings → Resources
2. Increase CPUs and Memory
3. Apply & Restart

**Check Disk Space:**
```powershell
docker system df
```

**Clean Up Unused Resources:**
```powershell
docker system prune
```

---

## Uninstallation

### Using Control Panel

1. **Stop DataForeman First**
   - Use Stop script or `docker-compose down`

2. **Open Control Panel**
   - Windows Settings → Apps → Installed Apps
   - Or: Control Panel → Programs → Uninstall a Program

3. **Uninstall DataForeman**
   - Find "DataForeman" in the list
   - Click Uninstall
   - Follow the prompts

4. **Data Removal Prompt**
   - You'll be asked: "Delete all data volumes?"
   - **No** = Keep databases for later reinstallation
   - **Yes** = Permanently delete all databases and data

### Manual Uninstallation

1. **Stop and Remove Containers:**
   ```powershell
   cd "C:\Program Files\DataForeman"
   docker-compose down
   ```

2. **Remove Data Volumes** (Optional):
   ```powershell
   docker volume ls | findstr dataforeman
   docker volume rm dataforeman_db-data
   docker volume rm dataforeman_tsdb-data
   ```

3. **Delete Application Files:**
   ```powershell
   Remove-Item -Recurse -Force "C:\Program Files\DataForeman"
   ```

4. **Remove Shortcuts:**
   - Delete desktop shortcut
   - Remove Start Menu folder

---

## Additional Resources

### Documentation
- [Main README](../README.md)
- [Installation Guide](installation.md)
- [Database Migrations](database-migrations.md)
- [API Documentation](api-registry.md)

### Support
- **GitHub Issues**: https://github.com/orionK-max/DataForeman/issues
- **Discussions**: https://github.com/orionK-max/DataForeman/discussions

### Docker Desktop Documentation
- **Official Docs**: https://docs.docker.com/desktop/windows/
- **Troubleshooting**: https://docs.docker.com/desktop/troubleshoot/overview/

---

## Quick Reference

### Common Commands

```powershell
# Start DataForeman
.\windows-installer\start-dataforeman.bat

# Stop DataForeman
.\windows-installer\stop-dataforeman.bat

# Check status
.\windows-installer\status-dataforeman.bat

# Update to specific version
.\windows-installer\update.ps1 -Version v1.2.0

# View logs
docker-compose logs -f

# Restart a specific service
docker-compose restart core

# Access PostgreSQL
docker-compose exec db psql -U postgres -d dataforeman

# Access TimescaleDB
docker-compose exec tsdb psql -U tsdb -d telemetry
```

### Default URLs
- Frontend: http://localhost:8080
- Core API: http://localhost:3000
- PostgreSQL: localhost:5432
- TimescaleDB: localhost:5433
- NATS: localhost:4222

### Default Credentials
- **Web Interface**: Your email and password set during installation
- **PostgreSQL**: postgres / postgres
- **TimescaleDB**: tsdb / tsdb
