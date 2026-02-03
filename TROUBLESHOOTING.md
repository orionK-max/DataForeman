# DataForeman Troubleshooting Guide

This guide helps you diagnose and fix common DataForeman problems.

---

## Quick Diagnostic Checklist

Run through this checklist first:

```bash
# 1. Check if Docker is running
docker --version
# Should show: Docker version 20.x.x or higher
```

Open a terminal in DataForeman folder and run:

```bash
# 2. Check container status
docker compose ps
# All services should show "Up"

# 3. Check for errors in logs
docker compose logs --tail 50
```

---

## Problem: Can't Access http://localhost:8080

### Symptom
Browser shows "Unable to connect" or "This site can't be reached"

### Solutions

**Solution 1: Check if containers are running**

Open a terminal in DataForeman folder and type:

```bash
docker compose ps
```

Look for services with "Exited" status. If any are exited:
```bash
docker compose up -d
```

**Solution 2: Check if port 8080 is already in use**
```bash
sudo lsof -i :8080
```

If another program is using port 8080, either:
- Stop that program, or
- Edit `docker compose.yml` to change the front service port from `8080:80` to `8081:80`

**Solution 3: Check frontend logs**
```bash
docker compose logs front
```

Look for error messages in the output.

**Solution 4: Restart everything**
```bash
docker compose down
docker compose up -d
```

Wait 30-60 seconds, then try accessing http://localhost:8080 again.

---

## Problem: Permission Denied Errors

### Symptom
Containers show errors like:
```
Permission denied: '/app/logs/core/core.log'
FATAL: could not open log file: Permission denied
```

### Solution

Open a terminal in DataForeman folder and type:

```bash
./fix-permissions.sh
docker compose restart
```

### Why This Happens
The containers run as specific user IDs that need write access to log directories. The fix-permissions script sets the correct permissions.

### Make It Permanent
If this happens after every reboot, add the script to your startup:

```bash
# Edit crontab
crontab -e

# Add this line (replace ~/DataForeman with your actual path):
@reboot cd /home/YOUR_USERNAME/DataForeman && ./fix-permissions.sh
```

---

## Problem: Containers Keep Restarting

### Symptom
Running `docker compose ps` shows containers constantly restarting:
```
NAME              STATUS
core-1            Restarting (1) 5 seconds ago
```

### Solutions

**Solution 1: Check memory usage**
```bash
docker stats --no-stream
```

If memory usage is near 100%, you need more RAM. DataForeman needs at least 4GB.

**Solution 2: Check container logs**
```bash
# Check which container is failing
docker compose ps

# View logs for that container (replace 'core' with your failing service)
docker compose logs core --tail 100
```

**Solution 3: Rebuild containers**
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## Problem: Database Connection Errors

### Symptom
Core service logs show:
```
Error: connect ECONNREFUSED 127.0.0.1:5432
Failed to connect to database
```

### Solutions

**Solution 1: Check if database is running**
```bash
docker compose ps db tsdb
```

Both should show "Up". If not:
```bash
docker compose up -d db tsdb
```

**Solution 2: Check database logs**
```bash
docker compose logs db
docker compose logs tsdb
```

**Solution 3: Restart in correct order**
```bash
# Stop everything
docker compose down

# Start databases first
docker compose up -d db tsdb

# Wait 10 seconds
sleep 10

# Start everything else
docker compose up -d
```

---

## Problem: Can't Login / Invalid Credentials

### Symptom
Login page shows "Invalid credentials" even with correct password

### Solutions

**Solution 1: Use default credentials**
- Email: `admin@example.com`
- Password: `DataForeman2024!`

**Solution 2: Reset admin password**

If you've forgotten your password, you need to reset it by recreating the admin user.

Open a terminal in DataForeman folder and type:

```bash
# Edit the .env file to set a new password
nano .env
```

Find `ADMIN_PASSWORD=` and set a new password. Save (Ctrl+X, Y, Enter).

Then delete and recreate the admin user:

```bash
# Connect to the database
docker compose exec db psql -U dataforeman dataforeman

# If you changed ADMIN_EMAIL, use that value instead of admin@example.com.
# You can see what Core is configured to use with:
# docker compose exec core sh -lc 'echo "ADMIN_EMAIL=${ADMIN_EMAIL:-admin@example.com}"'

# Delete the admin user
DELETE FROM users WHERE lower(email)=lower('admin@example.com');

# Exit the database
\q

# Restart core to recreate admin with new password from .env
docker compose restart core
```

Wait 10 seconds, then try logging in with the new password.

**Important:** The `.env` password is only used when creating the admin user. Once you change your password in the app, it's stored in the database and `.env` is no longer used.

**Solution 3: Check if database has admin user**
```bash
# If you set ADMIN_EMAIL in .env, replace admin@example.com with that value.
docker compose exec db psql -U dataforeman -c "SELECT email FROM users WHERE lower(email)=lower('admin@example.com');"
```

If empty, the admin user wasn't created. Check core logs:
```bash
docker compose logs core --tail 100 | grep admin
```

---

## Problem: Update Failed

### Symptom
After running update commands, containers won't start or show errors

### Solutions

**Solution 1: Verify you're on a valid version**

Open a terminal in DataForeman folder and type:

```bash
git describe --tags
```

This should show a version like `v1.2.0`. If it shows something strange:
```bash
# See all available versions
git fetch --tags
git tag -l

# Switch to latest (replace with actual latest version)
git checkout v1.2.0
```

**Solution 2: Rebuild everything**

Open a terminal in DataForeman folder and type:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

**Solution 3: Check for local changes**
```bash
git status
```

If you see modified files, reset them:
```bash
git reset --hard
docker compose build
docker compose up -d
```

---

## Problem: Out of Disk Space

### Symptom
Errors mentioning "no space left on device"

### Solutions

**Solution 1: Check disk usage**
```bash
df -h
docker system df
```

**Solution 2: Clean up Docker**
```bash
# Remove unused Docker images and containers
docker system prune -a

# Remove unused volumes (⚠️ WARNING: This removes ALL unused volumes)
docker system prune --volumes
```

**Solution 3: Configure data retention**
1. Access DataForeman at http://localhost:8080
2. Go to **Diagnostic → Capacity → Retention Policy**
3. Set retention period (e.g., 30 days)
4. Enable compression
5. Click Save

**Solution 4: Manual database cleanup**
```bash
# Connect to TimescaleDB
docker compose exec tsdb psql -U dataforeman dataforeman_ts

# Check table sizes
SELECT pg_size_pretty(pg_total_relation_size('tag_values'));

# Exit
\q
```

---

## Problem: Slow Performance

### Symptom
Web interface is slow, pages take long to load

### Solutions

**Solution 1: Check system resources**
```bash
# Check CPU and memory usage
docker stats --no-stream

# Check host system
top
```

**Solution 2: Check database size**
```bash
docker compose exec tsdb psql -U dataforeman dataforeman_ts -c "SELECT pg_size_pretty(pg_database_size('dataforeman_ts'));"
```

If very large (>10GB), configure data retention.

**Solution 3: Restart services**
```bash
docker compose restart
```

**Solution 4: Check network latency**
```bash
# From inside container to database
docker compose exec core ping -c 3 db
```

---

## Problem: Can't Connect to Industrial Devices

### Symptom
Device shows "disconnected" or "error" in DataForeman

### Solutions

**Solution 1: Check network connectivity**
```bash
# From inside connectivity container
docker compose exec connectivity ping -c 3 <device-ip>
```

**Solution 2: Check firewall**
```bash
# Check if outbound connections are allowed
sudo ufw status
```

**Solution 3: Check device configuration**
- Verify IP address is correct
- Verify port is correct (102 for S7, 44818 for EIP, 4840 for OPC UA)
- Verify device is powered on and accessible from the DataForeman host

**Solution 4: Check connectivity logs**
```bash
docker compose logs connectivity --tail 100
```

---

## Problem: Windows VM - Discovery Not Working

### Symptom
Network discovery doesn't find devices (but direct IP connection works)

### Solution
**Your VM network must be in Bridged mode, not NAT**

1. Shut down the VM
2. Open VM settings
3. Go to Network settings
4. Change from "NAT" or "Shared" to "Bridged Adapter"
5. Start the VM
6. Restart DataForeman

**Why:** UDP broadcast packets (used for discovery) cannot traverse NAT. Direct connections work because they use TCP to a specific IP.

---

## Getting More Help

If none of these solutions work:

### 1. Collect Diagnostic Information

Open a terminal in DataForeman folder and type:

```bash
# Check versions
docker --version
docker compose version
git describe --tags

# Check all logs
docker compose logs > /tmp/dataforeman-logs.txt

# Check system resources
docker stats --no-stream --no-trunc > /tmp/dataforeman-stats.txt
df -h > /tmp/dataforeman-disk.txt
free -h > /tmp/dataforeman-memory.txt
```

### 2. Create a GitHub Issue

Go to https://github.com/orionK-max/DataForeman/issues and create a new issue with:

- **What you were trying to do**
- **What happened instead**
- **Error messages** (from logs)
- **System information** (from diagnostic commands above)
- **Steps to reproduce** the problem

### 3. Search Existing Issues

Before creating a new issue, search existing issues - your problem might already be solved!

---

## Complete Reset (Last Resort)

⚠️ **WARNING: This will delete ALL your data!**

Only do this if instructed or if you want to start completely fresh.

Open a terminal in DataForeman folder and type:

```bash
# Stop and remove everything
docker compose down -v

# Remove all DataForeman containers and images
docker compose rm -f
docker rmi $(docker images | grep dataforeman | awk '{print $3}')

# Start fresh
./fix-permissions.sh
docker compose up -d
```

---

## Preventive Maintenance

To avoid problems:

### Weekly
- Check disk space: `df -h`
- Check container status: `docker compose ps`

### Monthly
- Review logs for errors: `docker compose logs --tail 200`
- Clean up Docker: `docker system prune`

### After System Updates/Reboots

Open a terminal in DataForeman folder and type:

```bash
./fix-permissions.sh
docker compose up -d
```

### Before Updating DataForeman

Open a terminal in DataForeman folder and type:

```bash
# Backup your data (just in case)
docker compose exec db pg_dump -U dataforeman dataforeman > /tmp/backup-$(date +%Y%m%d).sql
docker compose exec tsdb pg_dump -U dataforeman dataforeman_ts > /tmp/backup-ts-$(date +%Y%m%d).sql
```

---

Still stuck? Don't panic! Create a GitHub issue with your logs and we'll help you out.
