#Requires -Version 5.1
<#
.SYNOPSIS
    Installation script for DataForeman on Windows.

.DESCRIPTION
    This script is run by the installer to set up DataForeman.
    It checks prerequisites and configures the environment.
#>

$ErrorActionPreference = "Stop"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

Write-ColorOutput "===============================================================" "Cyan"
Write-ColorOutput "  DataForeman Installation" "Cyan"
Write-ColorOutput "===============================================================" "Cyan"
Write-Host ""

# Get installation directory
$InstallDir = Split-Path -Parent $PSScriptRoot

Write-ColorOutput "Installing to: $InstallDir" "Gray"
Write-Host ""

# Check for Docker
Write-ColorOutput "[1/4] Checking Docker..." "Yellow"
try {
    docker --version | Out-Null
    $dockerInstalled = $LASTEXITCODE -eq 0
} catch {
    $dockerInstalled = $false
}

if ($dockerInstalled) {
    Write-ColorOutput "[OK] Docker is installed" "Green"
    
    # Check if Docker is running
    try {
        docker ps | Out-Null
        Write-ColorOutput "[OK] Docker daemon is running" "Green"
    } catch {
        Write-ColorOutput "[WARN] Docker is installed but not running" "Yellow"
        Write-Host ""
        Write-Host "Please start Docker Desktop after installation."
    }
} else {
    Write-ColorOutput "[WARN] Docker is not installed" "Yellow"
    Write-Host ""
    Write-Host "DataForeman requires Docker Desktop."
    Write-Host "Please install it from: https://www.docker.com/products/docker-desktop/"
    Write-Host ""
}
Write-Host ""

# Create .env file if it doesn't exist
Write-ColorOutput "[2/4] Setting up environment..." "Yellow"
Set-Location $InstallDir
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-ColorOutput "[OK] Created .env file from template" "Green"
    } else {
        Write-ColorOutput "[WARN] .env.example not found" "Yellow"
    }
} else {
    Write-ColorOutput "[OK] .env file already exists" "Green"
}

# Configure Windows-specific Docker networking settings
if (Test-Path ".env") {
    try {
        $envContent = Get-Content ".env" -Raw
        
        # Set network mode to bridge for Windows (Docker Desktop doesn't support host mode)
        if ($envContent -notmatch "NETWORK_MODE=") {
            Add-Content ".env" "`n# Windows Docker networking configuration (set by installer)"
            Add-Content ".env" "NETWORK_MODE=bridge"
        }
        
        # Set service hostnames for bridge networking
        if ($envContent -notmatch "NATS_URL=") {
            Add-Content ".env" "NATS_URL=nats://nats:4222"
        }
        if ($envContent -notmatch "^PGHOST=") {
            Add-Content ".env" "PGHOST=db"
        }
        if ($envContent -notmatch "^TSDB_HOST=") {
            Add-Content ".env" "TSDB_HOST=tsdb"
        }
        if ($envContent -notmatch "CONNECTIVITY_PORT=") {
            Add-Content ".env" "CONNECTIVITY_PORT=3100"
        }
        
        Write-ColorOutput "[OK] Configured Docker networking for Windows" "Green"
    } catch {
        Write-ColorOutput "[WARN] Could not configure Windows networking settings" "Yellow"
    }
}
Write-Host ""

# Create directories and fix permissions
Write-ColorOutput "[3/4] Creating directories and setting permissions..." "Yellow"
try {
    $logsPath = Join-Path $InstallDir "logs"
    $varPath = Join-Path $InstallDir "var"
    
    # Create main directories
    @("logs/core", "logs/connectivity", "logs/front", "logs/nats", "logs/postgres", "logs/ops", "var") | ForEach-Object {
        $fullPath = Join-Path $InstallDir $_
        if (-not (Test-Path $fullPath)) {
            New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        }
    }
    
    # Set Windows permissions
    if (Test-Path $logsPath) {
        Start-Process -FilePath "icacls" -ArgumentList "`"$logsPath`"", "/grant", "Everyone:(OI)(CI)F", "/T" -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue
    }
    if (Test-Path $varPath) {
        Start-Process -FilePath "icacls" -ArgumentList "`"$varPath`"", "/grant", "Everyone:(OI)(CI)F", "/T" -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue
    }
    
    Write-ColorOutput "[OK] Directories created and Windows permissions set" "Green"
} catch {
    Write-ColorOutput "[WARN] Windows permissions could not be set" "Yellow"
    Write-ColorOutput "  This is normal during installation, fix-permissions.ps1 can be run later" "Gray"
}
Write-Host ""

# Installation complete
Write-ColorOutput "[4/4] Installation completed!" "Green"
Write-Host ""
Write-ColorOutput "Next steps:" "Cyan"
Write-ColorOutput "  1. Start Docker Desktop if not already running" "White"
Write-ColorOutput "  2. Run 'docker compose up -d' to start DataForeman" "White"
Write-ColorOutput "  3. Open http://localhost:8080 in your browser" "White"
Write-Host ""
Write-ColorOutput "Default login credentials:" "Cyan"
Write-ColorOutput "  Email: admin@example.com" "White"
Write-ColorOutput "  Password: Check the .env file (ADMIN_PASSWORD)" "White"
Write-Host ""