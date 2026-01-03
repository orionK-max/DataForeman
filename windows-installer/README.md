# Windows Installer for DataForeman

This directory contains the Windows installation package for DataForeman.

## What's Included

### Launcher Scripts
- **start-dataforeman.bat** - Starts DataForeman services
- **stop-dataforeman.bat** - Stops DataForeman services  
- **status-dataforeman.bat** - Shows service status

### PowerShell Scripts
- **install.ps1** - Run during installation to set up the environment
- **uninstall.ps1** - Run during uninstallation (handles data cleanup)
- **update.ps1** - Updates DataForeman to a new version

### Installer Configuration
- **installer.iss** - Inno Setup configuration file

## Building the Installer

### Prerequisites
1. Install [Inno Setup 6.0+](https://jrsoftware.org/isinfo.php)
2. Optionally install Inno Setup Preprocessor for advanced features

### Build Steps

#### Option 1: Using Inno Setup GUI
1. Open `installer.iss` in Inno Setup
2. Click Build > Compile
3. Installer will be created in `dist/` folder

#### Option 2: Using Command Line
```batch
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
```

#### Option 3: Using GitHub Actions
Push a tag to trigger automated builds:
```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

The installer will be automatically built and attached to the GitHub release.

## Testing the Installer

### Fresh Installation Test
1. Build the installer
2. Run `DataForeman-Setup-X.X.X.exe` on a clean Windows machine
3. Follow the installation wizard
4. Verify:
   - Desktop shortcut created
   - Start menu entries created
   - `.env` file created from `.env.example`
   - Docker check performed
   - Installation script ran successfully

### Update Test
1. Install an older version
2. Create some test data (add devices, create dashboards)
3. Build and run the new installer
4. Verify:
   - Data is preserved after update
   - New version is running
   - All previous configurations intact

### Uninstall Test
1. Install DataForeman
2. Create some test data
3. Uninstall via Control Panel
4. Verify:
   - User is prompted about data removal
   - If "No" selected, Docker volumes are preserved
   - If "Yes" selected, Docker volumes are removed
   - Application files removed

## Customization

### Changing the Icon
1. Create or obtain a `.ico` file (256x256 recommended)
2. Save as `windows-installer/icon.ico`
3. Uncomment the `SetupIconFile` line in `installer.iss`

### Changing the Version
Edit the version in `installer.iss`:
```inno
#define MyAppVersion "1.0.0"
```

Or pass it via command line:
```batch
ISCC.exe /DMyAppVersion=1.0.0 installer.iss
```

### Adding a License File
1. Add `LICENSE` file to the root directory
2. The installer will automatically include it

## Installer Behavior

### Installation
1. Checks for Docker Desktop
2. Prompts user to download Docker if not found
3. Copies files to `C:\Program Files\DataForeman`
4. Creates `.env` from `.env.example`
5. Creates log and runtime directories
6. Adds Start Menu and desktop shortcuts
7. Runs `install.ps1` configuration script
8. Optionally starts DataForeman

### Update/Reinstall
- Detects existing installation
- Preserves `.env` file (user configuration)
- Preserves Docker volumes (databases)
- Updates application files
- Runs migrations automatically on next start

### Uninstallation
1. Runs `uninstall.ps1` script
2. Stops Docker containers
3. Prompts user about data removal:
   - **Keep data**: Preserves Docker volumes for reinstallation
   - **Delete data**: Removes all databases and volumes
4. Removes application files
5. Removes shortcuts

## User Update Process

Users can update DataForeman in two ways:

### Method 1: Run New Installer (Easiest)
1. Download latest installer from GitHub Releases
2. Run installer (installs over existing version)
3. Data is automatically preserved

### Method 2: Use Update Script
1. Open PowerShell in DataForeman directory
2. Run: `.\windows-installer\update.ps1 -Version v1.2.0`
3. Script handles the update automatically

## Files Excluded from Installer

These directories are excluded to keep the installer small:
- `node_modules/` - Recreated by npm install
- `.git/` - Not needed for end users
- `logs/` - Created at runtime
- `var/` - Created at runtime
- `.github/` - CI/CD configuration
- `.vscode/` - Development settings
- `windows-installer/dist/` - Build output

## Troubleshooting

### Installer won't run
- Right-click > Run as Administrator
- Check Windows Defender/antivirus didn't block it

### Docker check fails
- Ensure Docker Desktop is installed
- Installer provides download link if not found

### Services won't start
- Check Docker Desktop is running
- View logs: `docker compose logs`
- Check ports 3000, 8080 are not in use

## Support

For issues with the installer, please check:
1. Windows event logs
2. Installation log in `%TEMP%`
3. GitHub Issues: https://github.com/orionK-max/DataForeman/issues
