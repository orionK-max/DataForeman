@echo off
REM Fix directory permissions for DataForeman on Windows
REM This ensures Docker containers can write to log directories via WSL2
REM Can be called with /SILENT flag to skip pauses

set SILENT_MODE=0
if /i "%1"=="/SILENT" set SILENT_MODE=1

if %SILENT_MODE%==0 (
    echo.
    echo ========================================
    echo   DataForeman Permission Fix
    echo ========================================
    echo.
)

cd /d "%~dp0.."

REM Convert path to WSL format for current directory
for /f "tokens=*" %%i in ('cd') do set INSTALL_DIR=%%i

if %SILENT_MODE%==0 echo Creating and fixing directory permissions in WSL...
if %SILENT_MODE%==0 echo.

REM Create directories and fix permissions via WSL (requires Docker Desktop with WSL2)
REM Use -e sh instead of bash for better compatibility
wsl -e sh -c "mkdir -p '%INSTALL_DIR:\=/%'/logs '%INSTALL_DIR:\=/%'/var '%INSTALL_DIR:\=/%'/logs/postgres '%INSTALL_DIR:\=/%'/logs/core '%INSTALL_DIR:\=/%'/logs/connectivity '%INSTALL_DIR:\=/%'/logs/front '%INSTALL_DIR:\=/%'/logs/ingestor '%INSTALL_DIR:\=/%'/logs/nats '%INSTALL_DIR:\=/%'/logs/ops '%INSTALL_DIR:\=/%'/logs/tsdb 2>/dev/null || true"
wsl -e sh -c "chmod -R 777 '%INSTALL_DIR:\=/%'/logs 2>/dev/null || true"
wsl -e sh -c "chmod -R 755 '%INSTALL_DIR:\=/%'/var 2>/dev/null || true"

if errorlevel 1 (
    if %SILENT_MODE%==0 (
        echo [WARNING] Could not set permissions via WSL
        echo This may happen if WSL is not initialized yet.
        echo Try starting Docker Desktop first.
        echo.
        pause
    )
    exit /b 1
)

if %SILENT_MODE%==0 (
    echo.
    echo Permissions fixed successfully!
    echo.
    pause
)
