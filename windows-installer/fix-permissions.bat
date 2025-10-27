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

if %SILENT_MODE%==0 echo Fixing directory permissions in WSL...
if %SILENT_MODE%==0 echo.

REM Fix permissions via WSL (requires Docker Desktop with WSL2)
wsl bash -c "chmod -R 777 '%INSTALL_DIR:\=/%'/logs 2>/dev/null || true"
wsl bash -c "chmod -R 755 '%INSTALL_DIR:\=/%'/var 2>/dev/null || true"

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
