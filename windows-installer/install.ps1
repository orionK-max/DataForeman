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

Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-ColorOutput "  DataForeman Installation" "Cyan"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
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
    Write-ColorOutput "✓ Docker is installed" "Green"
    
    # Check if Docker is running
    try {
        docker ps | Out-Null
        Write-ColorOutput "✓ Docker daemon is running" "Green"
    } catch {
        Write-ColorOutput "⚠ Docker is installed but not running" "Yellow"
        Write-Host ""
        Write-Host "Please start Docker Desktop after installation."
    }
} else {
    Write-ColorOutput "⚠ Docker is not installed" "Yellow"
    Write-Host ""
    Write-Host "DataForeman requires Docker Desktop."
    Write-Host "Please install it from: https://www.docker.com/products/docker-desktop/"
    Write-Host ""
    
    $response = Read-Host "Would you like to open the Docker Desktop download page? (Y/N)"
    if ($response -eq "Y" -or $response -eq "y") {
        Start-Process "https://www.docker.com/products/docker-desktop/"
    }
}
Write-Host ""

# Create .env file if it doesn't exist
Write-ColorOutput "[2/4] Setting up environment..." "Yellow"
Set-Location $InstallDir
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-ColorOutput "✓ Created .env file from template" "Green"
    } else {
        Write-ColorOutput "⚠ .env.example not found" "Yellow"
    }
} else {
    Write-ColorOutput "✓ .env file already exists" "Green"
}
Write-Host ""

# Create log directories
Write-ColorOutput "[3/4] Creating log directories..." "Yellow"
$logDirs = @(
    "logs",
    "logs/core",
    "logs/connectivity",
    "logs/front",
    "logs/ingestor",
    "logs/nats",
    "logs/postgres",
    "logs/tsdb",
    "logs/ops"
)

foreach ($dir in $logDirs) {
    $fullPath = Join-Path $InstallDir $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
    }
}
Write-ColorOutput "✓ Log directories created" "Green"
Write-Host ""

# Create var directory for runtime data
Write-ColorOutput "[4/4] Creating runtime directories..." "Yellow"
$varPath = Join-Path $InstallDir "var"
if (-not (Test-Path $varPath)) {
    New-Item -ItemType Directory -Path $varPath -Force | Out-Null
}
Write-ColorOutput "✓ Runtime directories created" "Green"
Write-Host ""

Write-ColorOutput "═══════════════════════════════════════════════════════════" "Green"
Write-ColorOutput "  Installation Complete!" "Green"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Green"
Write-Host ""

if ($dockerInstalled) {
    Write-ColorOutput "Next steps:" "Cyan"
    Write-ColorOutput "  1. Ensure Docker Desktop is running" "White"
    Write-ColorOutput "  2. Launch DataForeman from the Start Menu or desktop shortcut" "White"
    Write-ColorOutput "  3. Access the web interface at http://localhost:8080" "White"
} else {
    Write-ColorOutput "Before using DataForeman:" "Cyan"
    Write-ColorOutput "  1. Install Docker Desktop" "White"
    Write-ColorOutput "  2. Restart your computer" "White"
    Write-ColorOutput "  3. Launch DataForeman from the Start Menu" "White"
}

Write-Host ""
Write-ColorOutput "Default login credentials:" "Cyan"
Write-ColorOutput "  Email: admin@example.com" "White"
Write-ColorOutput "  Password: Check the .env file (ADMIN_PASSWORD)" "White"
Write-Host ""
