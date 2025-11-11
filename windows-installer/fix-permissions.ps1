#Requires -Version 5.1
<#
.SYNOPSIS
    Fix directory permissions for DataForeman on Windows.

.DESCRIPTION
    This script ensures Docker containers can write to log directories
    by setting proper permissions both in Windows and WSL2 environments.
    It uses a multi-layer approach for maximum compatibility.
#>

$ErrorActionPreference = "Stop"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Test-AdminRights {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Set-WindowsDirectoryPermissions {
    param([string]$Path)
    
    try {
        # Give Full Control to Everyone and Users groups
        $acl = Get-Acl $Path
        
        # Add Full Control for Everyone
        $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            "Everyone", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow"
        )
        $acl.SetAccessRule($accessRule)
        
        # Add Full Control for Users
        $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            "Users", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow"
        )
        $acl.SetAccessRule($accessRule)
        
        # Add Full Control for IIS_IUSRS (for Docker Desktop)
        try {
            $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                "IIS_IUSRS", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow"
            )
            $acl.SetAccessRule($accessRule)
        } catch {
            # IIS_IUSRS might not exist, ignore
        }
        
        Set-Acl -Path $Path -AclObject $acl
        return $true
    } catch {
        Write-ColorOutput "⚠ Could not set Windows permissions on $Path`: $($_.Exception.Message)" "Yellow"
        return $false
    }
}

Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-ColorOutput "  DataForeman Permission Fix" "Cyan"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-Host ""

# Get installation directory
$InstallDir = Split-Path -Parent $PSScriptRoot

Write-ColorOutput "Fixing permissions in: $InstallDir" "Gray"

# Check if running as Administrator
if (-not (Test-AdminRights)) {
    Write-ColorOutput "⚠ Not running as Administrator" "Yellow"
    Write-Host ""
    Write-Host "For best results, run this script as Administrator."
    Write-Host "Some permission fixes may not work without admin rights."
    Write-Host ""
}

Set-Location $InstallDir
Write-Host ""

# Step 1: Create directories using Windows native commands
Write-ColorOutput "[1/4] Creating directories in Windows..." "Yellow"

$logDirs = @(
    "logs",
    "logs\postgres", 
    "logs\core",
    "logs\connectivity", 
    "logs\front",
    "logs\ingestor",
    "logs\nats", 
    "logs\ops",
    "logs\tsdb",
    "var"
)

$allDirsCreated = $true
foreach ($dir in $logDirs) {
    $fullPath = Join-Path $InstallDir $dir
    try {
        if (-not (Test-Path $fullPath)) {
            New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
            Write-ColorOutput "  Created: $dir" "Gray"
        } else {
            Write-ColorOutput "  Exists: $dir" "Gray"
        }
    } catch {
        Write-ColorOutput "  ✗ Failed to create: $dir" "Red"
        $allDirsCreated = $false
    }
}

if ($allDirsCreated) {
    Write-ColorOutput "✓ All directories created successfully" "Green"
} else {
    Write-ColorOutput "⚠ Some directories could not be created" "Yellow"
}
Write-Host ""

# Step 2: Set Windows ACL permissions
Write-ColorOutput "[2/4] Setting Windows permissions..." "Yellow"

$windowsPermissionsSet = $true
foreach ($dir in $logDirs) {
    $fullPath = Join-Path $InstallDir $dir
    if (Test-Path $fullPath) {
        if (Set-WindowsDirectoryPermissions -Path $fullPath) {
            Write-ColorOutput "  ✓ Set permissions: $dir" "Gray"
        } else {
            $windowsPermissionsSet = $false
        }
    }
}

if ($windowsPermissionsSet) {
    Write-ColorOutput "✓ Windows permissions set successfully" "Green"
} else {
    Write-ColorOutput "⚠ Some Windows permissions could not be set" "Yellow"
    Write-Host ""
    Write-Host "This is normal if not running as Administrator."
    Write-Host "Docker Desktop will still work in most cases."
}
Write-Host ""

# Step 3: Check if Docker is running (optional)
Write-ColorOutput "[3/4] Checking Docker..." "Yellow"
try {
    docker ps | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "✓ Docker is running" "Green"
    } else {
        Write-ColorOutput "⚠ Docker is not running" "Yellow"
        Write-Host ""
        Write-Host "Please start Docker Desktop before starting DataForeman."
    }
} catch {
    Write-ColorOutput "⚠ Docker is not available" "Yellow"
    Write-Host ""
    Write-Host "Please install and start Docker Desktop."
    Write-Host "Download from: https://www.docker.com/products/docker-desktop/"
}
Write-Host ""

# Step 4: Fix permissions via WSL (if available)
Write-ColorOutput "[4/4] Setting WSL permissions (if available)..." "Yellow"

# Convert Windows path to WSL path
$wslPath = $InstallDir -replace '\\', '/' -replace '^([A-Z]):', {'/mnt/' + $_.Groups[1].Value.ToLower()}

try {
    # Test if WSL is available
    $wslOutput = wsl -e bash -c "echo 'WSL_TEST'" 2>$null
    if ($wslOutput -eq "WSL_TEST") {
        Write-ColorOutput "  WSL is available, setting permissions..." "Gray"
        
        # Ensure directories exist in WSL
        wsl -e bash -c "mkdir -p '$wslPath/logs' '$wslPath/var' '$wslPath/logs/postgres' '$wslPath/logs/core' '$wslPath/logs/connectivity' '$wslPath/logs/front' '$wslPath/logs/ingestor' '$wslPath/logs/nats' '$wslPath/logs/ops' '$wslPath/logs/tsdb' 2>/dev/null || true"
        
        # Set permissions via WSL
        wsl -e bash -c "chmod -R 777 '$wslPath/logs' 2>/dev/null || true"
        wsl -e bash -c "chmod -R 755 '$wslPath/var' 2>/dev/null || true"
        
        Write-ColorOutput "✓ WSL permissions set successfully" "Green"
    } else {
        Write-ColorOutput "⚠ WSL is not available or not responding" "Yellow"
        Write-Host ""
        Write-Host "This is normal on systems without WSL2."
        Write-Host "Windows permissions should be sufficient for Docker Desktop."
    }
} catch {
    Write-ColorOutput "⚠ Could not set WSL permissions" "Yellow"
    Write-Host ""
    Write-Host "This may happen if WSL is not properly configured."
    Write-Host "Windows permissions should still work for Docker Desktop."
}
Write-Host ""

Write-ColorOutput "═══════════════════════════════════════════════════════════" "Green"
Write-ColorOutput "  ✓ Permission fix complete!" "Green"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Green"
Write-Host ""
Write-Host "You can now start DataForeman from the Start Menu or desktop shortcut."
Write-Host ""
