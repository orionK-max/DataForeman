# DataForeman Quick Start Guide

**This guide is for complete beginners. If you're new to Linux or Docker, follow these simple steps.**

---

## What You Need

- A Linux computer (or Linux virtual machine)
- Internet connection (only needed for initial installation to download Docker images)
- About 10 minutes

**Note:** After installation, DataForeman works completely offline. Internet is only required during the first-time setup to download the necessary software components.

---

## Installation (6 Simple Steps)

### Step 1: Open a Terminal

Look for "Terminal" in your applications menu and open it. You should see a black or white window with a prompt (something like `username@computer:~$`).

### Step 2: Download DataForeman

Copy and paste this command into the terminal, then press Enter:

```bash
cd ~ && git clone https://github.com/orionK-max/DataForeman.git && cd DataForeman
```

**What this does:** Downloads DataForeman to your home folder and opens it.

**Note:** No GitHub account needed - DataForeman is public and free to download.

### Step 3: Set Up Permissions

Copy and paste this command, then press Enter:

```bash
./fix-permissions.sh
```

**What this does:** Gives DataForeman permission to create log files.

### Step 4: Start DataForeman

Copy and paste this command, then press Enter:

```bash
docker compose up -d
```

**What this does:** Downloads and starts all DataForeman services. **This will take 2-5 minutes the first time** as it downloads everything needed.

You'll see lots of text scrolling by - this is normal! Wait until you see your terminal prompt again.

### Step 5: Verify Installation

Check that all containers are running properly:

```bash
docker compose ps
```

You should see output showing several services with "Up" status:
- `core` - Running (Up)
- `front` - Running (Up)
- `db` - Running (Up)
- `tsdb` - Running (Up)
- `nats` - Running (Up)
- `connectivity` - Running (Up)
- `ingestor` - Running (Up)
- `rotator` - Running (Up)

If any service shows "Exited" or is missing, wait another minute and check again. The first startup can take a bit longer.

### Step 6: Access DataForeman

1. Open your web browser (Firefox, Chrome, etc.)
2. Type this in the address bar: `http://localhost:8080`
3. Press Enter

You should see the DataForeman login page!

**Login with:**
- Email: `admin@example.com`
- Password: `password`

---

## Daily Use

### Starting DataForeman

If DataForeman is not running, open a terminal in DataForeman folder and type:

```bash
docker compose up -d
```

Then go to http://localhost:8080 in your browser.

### Stopping DataForeman

Open a terminal in DataForeman folder and type:

```bash
docker compose down
```

**Don't worry!** This stops the program but keeps all your data safe.

### Checking if DataForeman is Running

Open a terminal in DataForeman folder and type:

```bash
docker compose ps
```

If you see several items with "Up" status, DataForeman is running!

---

## Updating to a New Version

### Step 1: Find the Latest Version

Go to: https://github.com/orionK-max/DataForeman/releases

Find the latest version (it looks like `v1.2.0`)

### Step 2: Update

Open a terminal in DataForeman folder and copy/paste these commands **one at a time**:

```bash
# Stop DataForeman
docker compose down

# Download the update (replace v1.2.0 with the version you found)
git fetch --tags
git checkout v1.2.0

# Rebuild and start
docker compose build
docker compose up -d
```

Wait 2-5 minutes, then go to http://localhost:8080

**Your data is safe!** All your settings and history are preserved during updates.

---

## Common Problems

### "I can't access http://localhost:8080"

**Solution:**

Open a terminal in DataForeman folder and type:

```bash
docker compose up -d
```

Wait 30 seconds, then try again.

### "Permission denied" errors

**Solution:**

Open a terminal in DataForeman folder and type:

```bash
./fix-permissions.sh
docker compose restart
```

### "Out of memory" or things keep crashing

**Solution:** DataForeman needs at least 4GB of RAM. Close other programs or increase your VM memory.

### "I forgot my password"

**Solution:** You can reset the admin password by editing the `.env` file and recreating the admin user.

Open a terminal in DataForeman folder and type:

```bash
nano .env
```

Find the line `ADMIN_PASSWORD=` and change the password. Press Ctrl+X, then Y, then Enter to save.

Then you need to delete and recreate the admin user:

```bash
# Connect to the database
docker compose exec db psql -U dataforeman dataforeman

# Delete the admin user (this also resets the password)
DELETE FROM users WHERE email = 'admin@example.com';

# Exit the database
\q

# Restart to recreate admin with new password from .env
docker compose restart core
```

Wait 10 seconds, then try logging in with the new password.

**Note:** The `.env` password is only used when creating the admin user for the first time. Once you change the password in the app, it's stored in the database and `.env` is no longer used.

---

## Getting Help

If you're stuck:

1. Check the [full README.md](README.md) for more details
2. Create an issue on [GitHub](https://github.com/orionK-max/DataForeman/issues)
3. Include what you tried and any error messages you see

---

## Understanding the Basics

### What is Docker?

Docker is like a shipping container for software. It packages everything DataForeman needs (databases, web server, etc.) into neat boxes that just work.

### What is "docker compose up -d"?

- `docker compose` = manage multiple Docker containers
- `up` = start everything
- `-d` = run in the background (so you can close the terminal)

### What is "localhost:8080"?

- `localhost` = your own computer
- `8080` = the "door number" (port) where DataForeman answers

**Accessing from other computers:**

DataForeman can be accessed from any computer on the same network! Instead of `localhost:8080`, use:
- `http://COMPUTER-IP:8080` (replace COMPUTER-IP with the actual IP address)
- Example: `http://192.168.1.100:8080`

**Requirements:**
- Firewall must allow port 8080 (web interface)
- Firewall must allow port 3000 (backend API - used by the web interface)
- Both computers must be on the same network

### Where is my data stored?

Your data is stored in Docker "volumes" which are special folders that persist even when you stop DataForeman. When you run `docker compose down`, your data stays safe!

---

## Next Steps

Once you're logged in:

1. **Explore the interface** - Click around and see what's available
2. **Read the User Guide** - Check the DataForeman documentation on the web site
3. **Set up data retention** - Go to Diagnostic → Capacity → Retention Policy
4. **Add your first device** - Go to Connectivity → Devices

Enjoy DataForeman! 🎉
