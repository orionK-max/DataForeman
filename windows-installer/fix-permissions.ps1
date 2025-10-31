#Requires -Version 5.1
<#
.SYNOPSIS
    Fix directory permissions for DataForeman on Windows.

.DESCRIPTION
    This script ensures Docker containers can write to log directories
    by setting proper permissions in WSL2.
#>

$ErrorActionPreference = "Stop"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-ColorOutput "  DataForeman Permission Fix" "Cyan"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-Host ""

# Get installation directory
$InstallDir = Split-Path -Parent $PSScriptRoot

Write-ColorOutput "Fixing permissions in: $InstallDir" "Gray"
Write-Host ""

# Check if Docker is running
Write-ColorOutput "[1/2] Checking Docker..." "Yellow"
try {
    docker ps | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "✗ Docker is not running" "Red"
        Write-Host ""
        Write-Host "Please start Docker Desktop and try again."
        exit 1
    }
    Write-ColorOutput "✓ Docker is running" "Green"
} catch {
    Write-ColorOutput "✗ Docker is not available" "Red"
    Write-Host ""
    Write-Host "Please install and start Docker Desktop."
    exit 1
}
Write-Host ""

# Fix permissions via WSL
Write-ColorOutput "[2/2] Creating directories and fixing permissions in WSL..." "Yellow"

# Convert Windows path to WSL path
$wslPath = $InstallDir -replace '\\', '/' -replace '^([A-Z]):', {'/mnt/' + $_.Groups[1].Value.ToLower()}

try {
    # Create all required directories first
    Write-ColorOutput "Creating log directories..." "Gray"
    wsl -e bash -c "mkdir -p '$wslPath/logs' '$wslPath/var' '$wslPath/logs/postgres' '$wslPath/logs/core' '$wslPath/logs/connectivity' '$wslPath/logs/front' '$wslPath/logs/ingestor' '$wslPath/logs/nats' '$wslPath/logs/ops' '$wslPath/logs/tsdb' 2>/dev/null || true"
    
    # Make logs directory world-writable (required for PostgreSQL UID 70)
    Write-ColorOutput "Setting logs directory to world-writable (0777)..." "Gray"
    wsl -e bash -c "chmod -R 777 '$wslPath/logs' 2>/dev/null || true"
    
    # Make var directory writable
    Write-ColorOutput "Setting var directory permissions (0755)..." "Gray"
    wsl -e bash -c "chmod -R 755 '$wslPath/var' 2>/dev/null || true"
    
    Write-ColorOutput "✓ Directories created and permissions fixed" "Green"
} catch {
    Write-ColorOutput "⚠ Could not fix permissions via WSL" "Yellow"
    Write-Host ""
    Write-Host "This may happen if WSL is not fully initialized."
    Write-Host "Try running this script again after Docker Desktop is fully started."
    Write-Host ""
    Write-Host "If containers still fail to start, try manually:"
    Write-Host "  wsl -e bash -c ""mkdir -p '$wslPath/logs' && chmod -R 777 '$wslPath/logs'"""
    Write-Host ""
}
Write-Host ""

Write-ColorOutput "═══════════════════════════════════════════════════════════" "Green"
Write-ColorOutput "  ✓ Permission fix complete!" "Green"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Green"
Write-Host ""
Write-Host "You can now start DataForeman from the Start Menu or desktop shortcut."
Write-Host ""
