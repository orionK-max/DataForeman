#Requires -Version 5.1
<#
.SYNOPSIS
    Uninstallation script for DataForeman on Windows.

.DESCRIPTION
    This script is run during uninstallation. It prompts the user
    about whether to keep or remove data volumes.
#>

$ErrorActionPreference = "Continue"

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
Set-Location $InstallDir

# Check if Docker is available
try {
    docker --version | Out-Null
    $dockerAvailable = $LASTEXITCODE -eq 0
} catch {
    $dockerAvailable = $false
}

if ($dockerAvailable) {
    # Stop DataForeman services and remove containers
    Write-ColorOutput "Stopping DataForeman services..." "Yellow"
    try {
        docker-compose down --remove-orphans 2>&1 | Out-Null
        Write-ColorOutput "✓ Services stopped and containers removed" "Green"
    } catch {
        Write-ColorOutput "⚠ Could not stop services (they may not be running)" "Yellow"
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
} else {
    Write-ColorOutput "Docker not available - skipping cleanup." "Yellow"
}

Write-Host ""
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Green"
Write-ColorOutput "  Uninstallation Complete" "Green"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Green"
Write-Host ""
