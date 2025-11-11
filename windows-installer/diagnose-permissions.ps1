#Requires -Version 5.1
<#
.SYNOPSIS
    Diagnose and fix DataForeman permission issues on Windows.

.DESCRIPTION
    This script provides detailed diagnostics for permission issues and
    attempts multiple strategies to fix them.
#>

$ErrorActionPreference = "Continue"

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Test-AdminRights {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-DirectoryWritable {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        return $false
    }
    
    try {
        $testFile = Join-Path $Path "test_write_$(Get-Random).tmp"
        "test" | Out-File -FilePath $testFile -Force
        Remove-Item $testFile -Force
        return $true
    } catch {
        return $false
    }
}

Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-ColorOutput "  DataForeman Permission Diagnostics" "Cyan"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-Host ""

# Get installation directory
$InstallDir = Split-Path -Parent $PSScriptRoot
Set-Location $InstallDir

Write-ColorOutput "Installation Directory: $InstallDir" "Gray"
Write-ColorOutput "Current User: $env:USERNAME" "Gray"
Write-ColorOutput "Running as Admin: $(Test-AdminRights)" "Gray"
Write-Host ""

# Check Docker
Write-ColorOutput "═══ DOCKER STATUS ═══" "Yellow"
try {
    $dockerVersion = docker --version 2>$null
    Write-ColorOutput "✓ Docker installed: $dockerVersion" "Green"
    
    docker ps 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-ColorOutput "✓ Docker daemon is running" "Green"
    } else {
        Write-ColorOutput "✗ Docker daemon is not running" "Red"
    }
} catch {
    Write-ColorOutput "✗ Docker is not installed or not in PATH" "Red"
}
Write-Host ""

# Check WSL
Write-ColorOutput "═══ WSL STATUS ═══" "Yellow"
try {
    $wslTest = wsl -e bash -c "echo 'WSL_OK'" 2>$null
    if ($wslTest -eq "WSL_OK") {
        Write-ColorOutput "✓ WSL is available and working" "Green"
        
        $wslVersion = wsl --version 2>$null
        if ($wslVersion) {
            Write-ColorOutput "✓ WSL version info available" "Green"
        }
    } else {
        Write-ColorOutput "✗ WSL is not responding correctly" "Red"
    }
} catch {
    Write-ColorOutput "✗ WSL is not available" "Red"
}
Write-Host ""

# Check directories and permissions
Write-ColorOutput "═══ DIRECTORY STATUS ═══" "Yellow"

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

$allDirsOk = $true
foreach ($dir in $logDirs) {
    $fullPath = Join-Path $InstallDir $dir
    $exists = Test-Path $fullPath
    $writable = if ($exists) { Test-DirectoryWritable -Path $fullPath } else { $false }
    
    if ($exists -and $writable) {
        Write-ColorOutput "✓ $dir (exists, writable)" "Green"
    } elseif ($exists) {
        Write-ColorOutput "⚠ $dir (exists, NOT writable)" "Yellow"
        $allDirsOk = $false
    } else {
        Write-ColorOutput "✗ $dir (missing)" "Red"
        $allDirsOk = $false
    }
}
Write-Host ""

if (-not $allDirsOk) {
    Write-ColorOutput "═══ ATTEMPTING FIXES ═══" "Yellow"
    
    # Fix 1: Create missing directories
    Write-ColorOutput "Creating missing directories..." "Gray"
    foreach ($dir in $logDirs) {
        $fullPath = Join-Path $InstallDir $dir
        if (-not (Test-Path $fullPath)) {
            try {
                New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
                Write-ColorOutput "  Created: $dir" "Green"
            } catch {
                Write-ColorOutput "  Failed: $dir - $($_.Exception.Message)" "Red"
            }
        }
    }
    Write-Host ""
    
    # Fix 2: Set Windows permissions using icacls
    Write-ColorOutput "Setting Windows permissions using icacls..." "Gray"
    try {
        $logsPath = Join-Path $InstallDir "logs"
        $varPath = Join-Path $InstallDir "var"
        
        if (Test-Path $logsPath) {
            $result = Start-Process -FilePath "icacls" -ArgumentList "`"$logsPath`"", "/grant", "Everyone:(OI)(CI)F", "/T" -Wait -PassThru -WindowStyle Hidden
            if ($result.ExitCode -eq 0) {
                Write-ColorOutput "  ✓ Set permissions on logs directory" "Green"
            } else {
                Write-ColorOutput "  ✗ Failed to set permissions on logs directory (exit code: $($result.ExitCode))" "Red"
            }
        }
        
        if (Test-Path $varPath) {
            $result = Start-Process -FilePath "icacls" -ArgumentList "`"$varPath`"", "/grant", "Everyone:(OI)(CI)F", "/T" -Wait -PassThru -WindowStyle Hidden
            if ($result.ExitCode -eq 0) {
                Write-ColorOutput "  ✓ Set permissions on var directory" "Green"
            } else {
                Write-ColorOutput "  ✗ Failed to set permissions on var directory (exit code: $($result.ExitCode))" "Red"
            }
        }
    } catch {
        Write-ColorOutput "  ✗ Error running icacls: $($_.Exception.Message)" "Red"
    }
    Write-Host ""
    
    # Fix 3: WSL permissions
    if ($wslTest -eq "WSL_OK") {
        Write-ColorOutput "Setting WSL permissions..." "Gray"
        $wslPath = $InstallDir -replace '\\', '/' -replace '^([A-Z]):', {'/mnt/' + $_.Groups[1].Value.ToLower()}
        
        try {
            wsl -e bash -c "mkdir -p '$wslPath/logs' '$wslPath/var' 2>/dev/null || true"
            wsl -e bash -c "chmod -R 777 '$wslPath/logs' 2>/dev/null"
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput "  ✓ Set WSL permissions on logs directory" "Green"
            } else {
                Write-ColorOutput "  ✗ Failed to set WSL permissions on logs directory" "Red"
            }
            
            wsl -e bash -c "chmod -R 755 '$wslPath/var' 2>/dev/null"
            if ($LASTEXITCODE -eq 0) {
                Write-ColorOutput "  ✓ Set WSL permissions on var directory" "Green"
            } else {
                Write-ColorOutput "  ✗ Failed to set WSL permissions on var directory" "Red"
            }
        } catch {
            Write-ColorOutput "  ✗ Error setting WSL permissions: $($_.Exception.Message)" "Red"
        }
    }
    Write-Host ""
    
    # Re-test after fixes
    Write-ColorOutput "═══ POST-FIX STATUS ═══" "Yellow"
    foreach ($dir in $logDirs) {
        $fullPath = Join-Path $InstallDir $dir
        $exists = Test-Path $fullPath
        $writable = if ($exists) { Test-DirectoryWritable -Path $fullPath } else { $false }
        
        if ($exists -and $writable) {
            Write-ColorOutput "✓ $dir (exists, writable)" "Green"
        } elseif ($exists) {
            Write-ColorOutput "⚠ $dir (exists, NOT writable)" "Yellow"
        } else {
            Write-ColorOutput "✗ $dir (missing)" "Red"
        }
    }
} else {
    Write-ColorOutput "✓ All directories exist and are writable!" "Green"
}

Write-Host ""
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-ColorOutput "  Diagnostics Complete" "Cyan"
Write-ColorOutput "═══════════════════════════════════════════════════════════" "Cyan"
Write-Host ""

if (-not (Test-AdminRights)) {
    Write-Host "NOTE: For best results, run this script as Administrator"
    Write-Host "Right-click this script and select 'Run as Administrator'"
    Write-Host ""
}

Write-Host "If issues persist:"
Write-Host "1. Ensure Docker Desktop is installed and running"
Write-Host "2. Try restarting Docker Desktop"
Write-Host "3. Try running this script as Administrator"
Write-Host "4. Check Docker Desktop settings -> Resources -> WSL Integration"
Write-Host ""

Read-Host "Press Enter to continue"