# DataForeman Quick Start Guide

**This guide is for complete beginners. If you're new to Linux or Docker, follow these simple steps.**

---

## What You Need

- A Linux computer (or Linux virtual machine)
- [Docker](https://docs.docker.com/engine/install/) installed
- Internet connection (only needed for initial installation to download Docker images)
- About 10 minutes

**Note:** After installation, DataForeman works completely offline. Internet is only required during the first-time setup to download the necessary software components.

---

## Installation (4 Simple Steps)

### Step 1: Open a Terminal

Look for "Terminal" in your applications menu and open it. You should see a black or white window with a prompt (something like `username@computer:~$`).

### Step 2: Download the required files

Create a folder and download the configuration files:

```bash
mkdir ~/dataforeman && cd ~/dataforeman

curl -o docker-compose.yml https://raw.githubusercontent.com/orionK-max/DataForeman/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/orionK-max/DataForeman/main/.env.example
curl -o start.sh https://raw.githubusercontent.com/orionK-max/DataForeman/main/start.sh
chmod +x start.sh
```

**What this does:** Creates a `dataforeman` folder with the files needed to run DataForeman. No GitHub account needed.

### Step 3: Configure your password (optional)

Open `.env` in a text editor and change `ADMIN_PASSWORD=password` to something secure. All other defaults work out of the box.

```bash
nano .env
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

### Step 4: Start DataForeman

```bash
bash start.sh
```

**This will take 2-5 minutes the first time** as it downloads the pre-built images. You'll see progress output — wait until the prompt returns.

---

## Verify Installation

Check that all containers are running:

```bash
docker compose ps
```

You should see several services with "Up" status:
- `core` - Running (Up)
- `front` - Running (Up)
- `db` - Running (Up)
- `tsdb` - Running (Up)
- `nats` - Running (Up)
- `broker` - Running (Up)
- `connectivity` - Running (Up)
- `rotator` - Running (Up)

If any service shows "Exited" or is missing, wait another minute and check again. The first startup can take a bit longer.

## Access DataForeman

1. Open your web browser (Firefox, Chrome, etc.)
2. Go to: `http://localhost:8080`

**Login with:**
- Email: `admin@example.com`
- Password: the value of `ADMIN_PASSWORD` in your `.env` file (default: `password`)

---

## Daily Use

### Starting DataForeman

If DataForeman is not running, open a terminal in your `dataforeman` folder and type:

```bash
bash start.sh
```

Then go to http://localhost:8080 in your browser.

### Stopping DataForeman

Open a terminal in your `dataforeman` folder and type:

```bash
docker compose down
```

**Don't worry!** This stops the program but keeps all your data safe.

### Checking if DataForeman is Running

Open a terminal in your `dataforeman` folder and type:

```bash
docker compose ps
```

If you see several items with "Up" status, DataForeman is running!

---

## Updating to a New Version

Open a terminal in your `dataforeman` folder and run:

```bash
docker compose pull
docker compose up -d
```

`docker compose pull` downloads the latest pre-built images. `up -d` restarts the containers with the new versions. Wait 1-2 minutes, then go to http://localhost:8080.

**Your data is safe!** All your settings and history are stored in Docker volumes and are not affected by updates.

---

## Common Problems

### "I can't access http://localhost:8080"

**Solution:**

Open a terminal in your `dataforeman` folder and type:

```bash
docker compose up -d
```

Wait 30 seconds, then try again.

### "Permission denied" errors

**Solution:**

Open a terminal in your `dataforeman` folder and type:

```bash
sudo chown -R $USER:$USER ~/dataforeman
docker compose up -d
```

### "Out of memory" or things keep crashing

**Solution:** DataForeman needs at least 4GB of RAM. Close other programs or increase your VM memory.

### "I forgot my password"

**Solution:** Edit the `.env` file in your `dataforeman` folder and change `ADMIN_PASSWORD=`:

```bash
nano ~/dataforeman/.env
```

Find the line `ADMIN_PASSWORD=` and change the password. Press Ctrl+X, then Y, then Enter to save.

Then you need to delete and recreate the admin user:

```bash
# Connect to the database
docker compose exec db psql -U postgres dataforeman

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

---

## Developer / Build-from-Source

If you want to modify the source code and build images locally:

```bash
git clone https://github.com/orionK-max/DataForeman.git && cd DataForeman
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
```

See the [README.md](README.md) for full developer instructions.
