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
        
        # Configure Windows-specific networking settings
        Write-ColorOutput "  Configuring Windows Docker networking..." "Gray"
        
        # Read the .env file
        $envContent = Get-Content ".env" -Raw
        
        # Replace database and service hostnames for bridge networking
        $envContent = $envContent -replace 'PGHOST=localhost', 'PGHOST=db'
        $envContent = $envContent -replace 'TSDB_HOST=localhost', 'TSDB_HOST=tsdb'
        $envContent = $envContent -replace 'NATS_URL=nats://localhost:4222', 'NATS_URL=nats://nats:4222'
        
        # Add Windows-specific port bindings at the end
        $windowsNetworking = @"

########################################
# Windows Docker Networking
########################################
# Windows requires bridge networking with 0.0.0.0 bindings
# for inter-container communication
DB_PORT_BINDING=0.0.0.0:5432:5432
TSDB_PORT_BINDING=0.0.0.0:5433:5432
NATS_PORT_BINDING=0.0.0.0:4222:4222

# Do not set CONNECTIVITY_NETWORK_MODE on Windows
# (uses default bridge networking for compatibility)
"@
        
        $envContent = $envContent + $windowsNetworking
        
        # Write back to .env
        Set-Content -Path ".env" -Value $envContent -NoNewline
        
        Write-ColorOutput "[OK] Windows networking configured (bridge mode with service names)" "Green"
    } else {
        Write-ColorOutput "[WARN] .env.example not found" "Yellow"
    }
} else {
    Write-ColorOutput "[OK] .env file already exists (not modified)" "Green"
    Write-ColorOutput "  If you need to reconfigure networking, delete .env and run install again" "Gray"
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