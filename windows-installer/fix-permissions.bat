@echo off
REM Fix directory permissions for DataForeman on Windows
REM This ensures Docker containers can write to log directories via WSL2
REM Can be called with /SILENT flag to skip pauses
REM Can be called with /SKIPCHECK to bypass admin verification (used by installer)

set SILENT_MODE=0
set SKIP_ADMIN_CHECK=0
if /i "%1"=="/SILENT" set SILENT_MODE=1
if /i "%2"=="/SKIPCHECK" set SKIP_ADMIN_CHECK=1
if /i "%1"=="/SKIPCHECK" set SKIP_ADMIN_CHECK=1

REM Check for Administrator privileges (unless SKIPCHECK is passed)
if %SKIP_ADMIN_CHECK%==0 (
    net session >nul 2>&1
    if errorlevel 1 (
        echo.
        echo ========================================
        echo   Administrator Rights Required
        echo ========================================
        echo.
        echo This script needs to be run as Administrator to create
        echo directories in Program Files.
        echo.
        echo Please right-click this file and select "Run as Administrator"
        echo.
        pause
        exit /b 1
    )
)

if %SILENT_MODE%==0 (
    echo.
    echo ========================================
    echo   DataForeman Permission Fix
    echo ========================================
    echo.
)

cd /d "%~dp0.."

REM Get current directory
for /f "tokens=*" %%i in ('cd') do set INSTALL_DIR=%%i

if %SILENT_MODE%==0 (
    echo Current directory: %INSTALL_DIR%
    echo.
    echo Creating and fixing directory permissions in WSL...
    echo.
)

REM Convert Windows path to WSL path (C:\Path -> /mnt/c/Path)
REM Handle drive letter and preserve spaces in path
set DRIVE_LETTER=%INSTALL_DIR:~0,1%
call set DRIVE_LETTER=%%DRIVE_LETTER:A=a%%
call set DRIVE_LETTER=%%DRIVE_LETTER:B=b%%
call set DRIVE_LETTER=%%DRIVE_LETTER:C=c%%
call set DRIVE_LETTER=%%DRIVE_LETTER:D=d%%
call set DRIVE_LETTER=%%DRIVE_LETTER:E=e%%
call set DRIVE_LETTER=%%DRIVE_LETTER:F=f%%

REM Get path after drive letter (C:\ -> everything after)
set "REST_OF_PATH=%INSTALL_DIR:~3%"
REM Replace backslashes with forward slashes
set "REST_OF_PATH=%REST_OF_PATH:\=/%"
REM Build final WSL path
set "WSL_PATH=/mnt/%DRIVE_LETTER%/%REST_OF_PATH%"

if %SILENT_MODE%==0 echo WSL path: %WSL_PATH%
if %SILENT_MODE%==0 echo.

REM Step 1: Create directories using Windows commands
if %SILENT_MODE%==0 echo [1/4] Creating directories in Windows...
if not exist "logs" mkdir "logs"
if not exist "logs\postgres" mkdir "logs\postgres"
if not exist "logs\core" mkdir "logs\core"
if not exist "logs\connectivity" mkdir "logs\connectivity"
if not exist "logs\front" mkdir "logs\front"
if not exist "logs\ingestor" mkdir "logs\ingestor"
if not exist "logs\nats" mkdir "logs\nats"
if not exist "logs\ops" mkdir "logs\ops"
if not exist "logs\tsdb" mkdir "logs\tsdb"
if not exist "var" mkdir "var"

if %SILENT_MODE%==0 echo Directories created successfully

REM Step 2: Set Windows permissions using icacls (more reliable than ACL)
if %SILENT_MODE%==0 echo [2/4] Setting Windows permissions...
icacls "logs" /grant Everyone:(OI)(CI)F /T >nul 2>&1
if errorlevel 1 (
    if %SILENT_MODE%==0 echo [WARNING] Could not set Windows permissions on logs directory
) else (
    if %SILENT_MODE%==0 echo Windows permissions set for logs directory
)

icacls "var" /grant Everyone:(OI)(CI)F /T >nul 2>&1
if errorlevel 1 (
    if %SILENT_MODE%==0 echo [WARNING] Could not set Windows permissions on var directory
) else (
    if %SILENT_MODE%==0 echo Windows permissions set for var directory
)

REM Step 3: Check Docker availability
if %SILENT_MODE%==0 echo [3/4] Checking Docker...
docker --version >nul 2>&1
if errorlevel 1 (
    if %SILENT_MODE%==0 echo [WARNING] Docker is not installed or not in PATH
) else (
    if %SILENT_MODE%==0 echo Docker is available
)

REM Step 4: Set WSL permissions if available
if %SILENT_MODE%==0 echo [4/4] Setting WSL permissions (if available)...

REM Test if WSL is available first
wsl echo WSL_TEST >nul 2>&1
if errorlevel 1 (
    if %SILENT_MODE%==0 echo WSL is not available, using Windows permissions only
    goto :skip_wsl
)

REM Give WSL a moment to sync filesystem
timeout /t 1 /nobreak >nul 2>&1

REM Verify directories exist in WSL before setting permissions
wsl sh -c "mkdir -p '%WSL_PATH%/logs' '%WSL_PATH%/var' '%WSL_PATH%/logs/postgres' '%WSL_PATH%/logs/core' '%WSL_PATH%/logs/connectivity' '%WSL_PATH%/logs/front' '%WSL_PATH%/logs/ingestor' '%WSL_PATH%/logs/nats' '%WSL_PATH%/logs/ops' '%WSL_PATH%/logs/tsdb' 2>/dev/null || true" >nul 2>&1

REM Set permissions via WSL
wsl sh -c "chmod -R 777 '%WSL_PATH%/logs'" >nul 2>&1
if errorlevel 1 (
    if %SILENT_MODE%==0 echo [WARNING] Could not set WSL permissions on logs directory
) else (
    if %SILENT_MODE%==0 echo WSL permissions set for logs directory
)

wsl sh -c "chmod -R 755 '%WSL_PATH%/var'" >nul 2>&1
if errorlevel 1 (
    if %SILENT_MODE%==0 echo [WARNING] Could not set WSL permissions on var directory
) else (
    if %SILENT_MODE%==0 echo WSL permissions set for var directory
)

:skip_wsl

if %SILENT_MODE%==0 (
    echo.
    echo ========================================
    echo   Permissions fixed successfully!
    echo ========================================
    echo.
    pause
)
