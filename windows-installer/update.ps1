#Requires -Version 5.1
<#
.SYNOPSIS
    Updates DataForeman to a specific version from GitHub releases.

.DESCRIPTION
    This script safely updates DataForeman while preserving all user data.
    It stops services, updates the code, and restarts with the new version.

.PARAMETER Version
    The version tag to update to (e.g., "v1.2.0")

.PARAMETER SkipBackup
    Skip the data volume verification step

.EXAMPLE
    .\update.ps1 -Version v1.2.0
#>

param(
    [Parameter(Mandatory=$true, HelpMessage="Version tag to update to (e.g., v1.2.0)")]
    [string]$Version,
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipBackup = $false
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Color functions
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
    Write-ColorOutput "  $Text" "Cyan"
    Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
    Write-Host ""
}

function Write-Step {
    param([int]$Step, [int]$Total, [string]$Message)
    Write-ColorOutput "[$Step/$Total] $Message" "Yellow"
}

function Write-Success {
    param([string]$Message)
    Write-ColorOutput "✓ $Message" "Green"
}

function Write-Warning {
    param([string]$Message)
    Write-ColorOutput "⚠ $Message" "Yellow"
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-ColorOutput "✗ $Message" "Red"
}

# Start update process
Write-Header "DataForeman Update Tool"
Write-ColorOutput "Target version: $Version" "Cyan"
Write-Host ""

# Change to DataForeman directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataForemanDir = Split-Path -Parent $ScriptDir
Set-Location $DataForemanDir

Write-ColorOutput "Installation directory: $DataForemanDir" "Gray"
Write-Host ""

# Step 1: Check Docker
Write-Step 1 7 "Checking Docker..."
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker command failed"
    }
    Write-Success "Docker is available: $dockerVersion"
    
    # Check if Docker daemon is running
    docker ps | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Docker daemon is not running!"
        Write-Host ""
        Write-Host "Please start Docker Desktop and try again."
        exit 1
    }
    Write-Success "Docker daemon is running"
} catch {
    Write-ErrorMsg "Docker is not installed or not running!"
    Write-Host ""
    Write-Host "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop/"
    exit 1
}
Write-Host ""

# Step 2: Check Git
Write-Step 2 7 "Checking Git..."
try {
    $gitVersion = git --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed"
    }
    Write-Success "Git is available: $gitVersion"
} catch {
    Write-ErrorMsg "Git is not installed!"
    Write-Host ""
    Write-Host "Please install Git from: https://git-scm.com/download/win"
    exit 1
}
Write-Host ""

# Step 3: Verify data volumes (unless skipped)
if (-not $SkipBackup) {
    Write-Step 3 7 "Verifying data volumes..."
    try {
        $volumes = docker volume ls --format "{{.Name}}" | Select-String "dataforeman"
        if ($volumes.Count -gt 0) {
            Write-Success "Found $($volumes.Count) data volume(s):"
            foreach ($vol in $volumes) {
                Write-ColorOutput "  • $vol" "Gray"
            }
            Write-Host ""
            Write-ColorOutput "These volumes contain your databases and will be preserved." "Gray"
        } else {
            Write-Warning "No DataForeman volumes found (this might be a fresh install)"
        }
    } catch {
        Write-Warning "Could not verify volumes: $_"
    }
    Write-Host ""
}

# Step 4: Stop DataForeman
Write-Step 4 7 "Stopping DataForeman services..."
try {
    docker compose down 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Services stopped successfully"
    } else {
        Write-Warning "Some services may not have been running"
    }
} catch {
    Write-Warning "Error stopping services: $_"
}
Write-Host ""

# Step 5: Update code
Write-Step 5 7 "Downloading version $Version..."
try {
    # Fetch all tags
    Write-ColorOutput "  Fetching tags from GitHub..." "Gray"
    git fetch --tags --force 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to fetch tags"
    }
    Write-Success "Tags fetched"
    
    # Check if tag exists
    $tagExists = git tag -l $Version
    if (-not $tagExists) {
        Write-ErrorMsg "Version $Version not found!"
        Write-Host ""
        Write-Host "Available versions:"
        git tag -l | Sort-Object -Descending | Select-Object -First 10
        exit 1
    }
    
    # Checkout the version
    Write-ColorOutput "  Checking out $Version..." "Gray"
    git checkout $Version 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to checkout version"
    }
    Write-Success "Checked out version $Version"
} catch {
    Write-ErrorMsg "Failed to update code: $_"
    Write-Host ""
    Write-Host "You may need to manually resolve git conflicts or check your internet connection."
    exit 1
}
Write-Host ""

# Step 6: Rebuild containers
Write-Step 6 7 "Building updated containers..."
Write-ColorOutput "  This may take several minutes..." "Gray"
try {
    docker compose build 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Containers built successfully"
    } else {
        Write-Warning "Build completed with warnings"
    }
} catch {
    Write-ErrorMsg "Failed to build containers: $_"
    exit 1
}
Write-Host ""

# Step 7: Start updated version
Write-Step 7 7 "Starting DataForeman $Version..."
try {
    docker compose up -d 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to start services"
    }
    Write-Success "Services started"
    
    # Wait a moment for services to initialize
    Write-ColorOutput "  Waiting for services to initialize..." "Gray"
    Start-Sleep -Seconds 3
    
    # Check service status
    $runningServices = docker compose ps --services --filter "status=running"
    if ($runningServices) {
        Write-Success "Running services:"
        foreach ($service in $runningServices) {
            Write-ColorOutput "  • $service" "Gray"
        }
    }
} catch {
    Write-ErrorMsg "Failed to start services: $_"
    Write-Host ""
    Write-Host "Check logs with: docker compose logs"
    exit 1
}

# Success summary
Write-Host ""
Write-Header "Update Complete!"
Write-ColorOutput "DataForeman has been updated to $Version" "Green"
Write-Host ""
Write-ColorOutput "Access your application:" "Cyan"
Write-ColorOutput "  Frontend: http://localhost:8080" "White"
Write-ColorOutput "  Core API: http://localhost:3000" "White"
Write-Host ""
Write-ColorOutput "Your data has been preserved:" "Cyan"
Write-ColorOutput "  • Databases (PostgreSQL, TimescaleDB)" "White"
Write-ColorOutput "  • Configurations and settings" "White"
Write-ColorOutput "  • User accounts and permissions" "White"
Write-ColorOutput "  • Dashboards and devices" "White"
Write-Host ""
Write-ColorOutput "To view logs: docker compose logs -f" "Gray"
Write-ColorOutput "To check status: docker compose ps" "Gray"
Write-Host ""
