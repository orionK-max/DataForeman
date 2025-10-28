#Requires -Version 5.1
<#
.SYNOPSIS
    Uninstallation script for DataForeman on Windows.

.DESCRIPTION
    This script is run during uninstallation. It prompts the user
    about whether to keep or remove data volumes.
#>

$ErrorActionPreference = "Continue"

# Force console window to stay open
$Host.UI.RawUI.WindowTitle = "DataForeman Uninstaller"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-ColorOutput "  DataForeman Uninstallation" "Cyan"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-Host ""

# Change to installation directory
$InstallDir = Split-Path -Parent $PSScriptRoot
Write-ColorOutput "Installation directory: $InstallDir" "Gray"
Set-Location $InstallDir
Write-ColorOutput "Current directory: $(Get-Location)" "Gray"
Write-Host ""

# Check if Docker is available
Write-ColorOutput "Checking for Docker..." "Yellow"
try {
    docker --version | Out-Null
    $dockerAvailable = $LASTEXITCODE -eq 0
} catch {
    $dockerAvailable = $false
}

if (-not $dockerAvailable) {
    Write-ColorOutput "⚠ Docker is not available or not running" "Red"
    Write-ColorOutput "Please start Docker Desktop and try again" "Yellow"
    Write-Host ""
    Write-ColorOutput "Press any key to exit..." "Gray"
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-ColorOutput "✓ Docker is available" "Green"
Write-Host ""

# Stop DataForeman services and remove containers
Write-ColorOutput "Stopping DataForeman services..." "Yellow"

# Check if docker-compose.yml exists
if (-not (Test-Path "docker-compose.yml")) {
    Write-ColorOutput "⚠ docker-compose.yml not found in: $(Get-Location)" "Yellow"
    Write-ColorOutput "Attempting to stop containers manually..." "Yellow"
    
    # Try to stop containers by name pattern
    $containers = docker ps -a --filter "name=dataforeman" --format "{{.Names}}"
    if ($containers) {
        Write-ColorOutput "Found containers:" "Gray"
        foreach ($container in $containers) {
            Write-ColorOutput "  • $container" "White"
        }
        Write-Host ""
        Write-ColorOutput "Stopping and removing containers..." "Yellow"
        docker stop $containers 2>&1 | Out-Null
        docker rm $containers 2>&1 | Out-Null
        Write-ColorOutput "✓ Containers stopped and removed" "Green"
    } else {
        Write-ColorOutput "No running containers found" "Gray"
    }
} else {
    Write-ColorOutput "Running docker-compose down..." "Gray"
    $dcOutput = docker-compose down --remove-orphans 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "✓ Services stopped and containers removed" "Green"
    } else {
        Write-ColorOutput "⚠ docker-compose down failed:" "Yellow"
        Write-Host $dcOutput
        
        # Fallback to manual container removal
        Write-ColorOutput "Attempting manual container removal..." "Yellow"
        $containers = docker ps -a --filter "name=dataforeman" --format "{{.Names}}"
        if ($containers) {
            docker stop $containers 2>&1 | Out-Null
            docker rm $containers 2>&1 | Out-Null
            Write-ColorOutput "✓ Containers stopped and removed manually" "Green"
        }
    }
}
Write-Host ""

# Check for data volumes
Write-ColorOutput "Checking for data volumes..." "Yellow"
$volumes = docker volume ls --format "{{.Name}}" | Select-String "dataforeman"

if ($volumes.Count -gt 0) {
    Write-Host ""
    Write-ColorOutput "WARNING: DataForeman has the following data volumes:" "Yellow"
    Write-Host ""
    foreach ($vol in $volumes) {
        Write-ColorOutput "  • $vol" "White"
    }
    Write-Host ""
    Write-ColorOutput "These volumes contain:" "Cyan"
    Write-ColorOutput "  • Your databases (PostgreSQL, TimescaleDB)" "White"
    Write-ColorOutput "  • All configurations and settings" "White"
    Write-ColorOutput "  • User accounts and dashboards" "White"
    Write-ColorOutput "  • Historical telemetry data" "White"
    Write-Host ""
    Write-Host ""
    Write-ColorOutput "Do you want to DELETE all data volumes? (Y/N)" "Red"
    Write-ColorOutput "  Y = Delete everything (cannot be undone)" "Red"
    Write-ColorOutput "  N = Keep data (you can reinstall later)" "Green"
    Write-Host ""
    
    $response = Read-Host "Delete all data? (Y/N)"
    
    if ($response -eq "Y" -or $response -eq "y") {
        Write-Host ""
        Write-ColorOutput "Deleting data volumes..." "Red"
        foreach ($vol in $volumes) {
            try {
                docker volume rm $vol 2>&1 | Out-Null
                Write-ColorOutput "✓ Deleted: $vol" "Red"
            } catch {
                Write-ColorOutput "⚠ Could not delete: $vol" "Yellow"
            }
        }
        Write-Host ""
        Write-ColorOutput "All data volumes have been removed." "Red"
    } else {
        Write-Host ""
        Write-ColorOutput "Data volumes will be preserved." "Green"
        Write-Host ""
        Write-ColorOutput "Your data will still be available if you reinstall DataForeman." "Cyan"
        Write-ColorOutput "To manually remove data later, run:" "Gray"
        Write-ColorOutput "  docker volume ls" "White"
        Write-ColorOutput "  docker volume rm <volume-name>" "White"
    }
} else {
    Write-ColorOutput "No data volumes found." "Gray"
}

Write-Host ""
Write-Host ""

# Check for Docker images
Write-ColorOutput "Checking for DataForeman Docker images..." "Yellow"
$images = docker images --format "{{.Repository}}:{{.Tag}}" | Select-String "dataforeman"

if ($images.Count -gt 0) {
    Write-Host ""
    Write-ColorOutput "Found the following DataForeman images:" "Yellow"
    Write-Host ""
    foreach ($img in $images) {
        Write-ColorOutput "  • $img" "White"
    }
    Write-Host ""
    Write-ColorOutput "Docker images take up disk space but allow faster reinstallation." "Cyan"
    Write-Host ""
    Write-ColorOutput "Do you want to DELETE all DataForeman images? (Y/N)" "Yellow"
    Write-ColorOutput "  Y = Delete images (free up disk space)" "Yellow"
    Write-ColorOutput "  N = Keep images (faster reinstall)" "Green"
    Write-Host ""
    
    $responseImg = Read-Host "Delete images? (Y/N)"
    
    if ($responseImg -eq "Y" -or $responseImg -eq "y") {
        Write-Host ""
        Write-ColorOutput "Deleting Docker images..." "Yellow"
        foreach ($img in $images) {
            try {
                docker rmi $img 2>&1 | Out-Null
                Write-ColorOutput "✓ Deleted: $img" "Yellow"
            } catch {
                Write-ColorOutput "⚠ Could not delete: $img" "Yellow"
            }
        }
        Write-Host ""
        Write-ColorOutput "All DataForeman images have been removed." "Yellow"
    } else {
        Write-Host ""
        Write-ColorOutput "Docker images will be preserved." "Green"
        Write-Host ""
        Write-ColorOutput "To manually remove images later, run:" "Gray"
        Write-ColorOutput "  docker images" "White"
        Write-ColorOutput "  docker rmi <image-name>" "White"
    }
} else {
    Write-ColorOutput "No DataForeman images found." "Gray"
}

Write-Host ""
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Green"
Write-ColorOutput "  Uninstallation Complete" "Green"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Green"
Write-Host ""
Write-ColorOutput "Press any key to close this window..." "Gray"
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
