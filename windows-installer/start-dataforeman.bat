@echo off
REM DataForeman Launcher for Windows
REM This script starts the DataForeman application using Docker Compose

REM Skip admin check if /SKIPCHECK parameter is passed (used by installer)
if /i "%~1"=="/SKIPCHECK" goto :SkipAdminCheck

REM Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo ========================================
    echo   Administrator Rights Required
    echo ========================================
    echo.
    echo This script needs to be run as Administrator.
    echo Please right-click "Start DataForeman" and select "Run as Administrator"
    echo.
    pause
    exit /b 1
)

:SkipAdminCheck

echo.
echo ========================================
echo   DataForeman - Starting Application
echo ========================================
echo.

REM Change to the DataForeman installation directory
cd /d "%~dp0.."

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running!
    echo.
    echo Please start Docker Desktop and try again.
    echo You can find Docker Desktop in your Start Menu.
    echo.
    pause
    exit /b 1
)

echo [1/3] Checking environment...
if not exist ".env" (
    echo .env file not found, creating from .env.example...
    copy .env.example .env >nul
    echo Please edit .env file to set your passwords and configuration.
    echo.
)

REM Fix permissions via batch file (no PowerShell required)
REM Pass /SKIPCHECK if we were called with it (from installer)
echo [1.5/3] Setting up directory permissions...
echo This ensures Docker containers can write to log directories...
if /i "%~1"=="/SKIPCHECK" (
    call "%~dp0fix-permissions.bat" /SILENT /SKIPCHECK
) else (
    call "%~dp0fix-permissions.bat" /SILENT
)
if errorlevel 1 (
    echo [ERROR] Permission fix via WSL failed!
    echo.
    echo WSL is required for DataForeman to run on Windows.
    echo Please ensure Docker Desktop is running and WSL is installed.
    echo.
    echo Try running fix-permissions.bat manually from the Start Menu.
    echo.
    pause
    exit /b 1
)

echo [2/3] Building and starting DataForeman services...

REM Check if images need to be built (first run detection)
docker images dataforeman-core --format "{{.Repository}}" 2>nul | findstr "dataforeman-core" >nul
if errorlevel 1 (
    echo.
    echo *** FIRST RUN DETECTED ***
    echo Building container images from source...
    echo This will take several minutes. Please wait - the window will stay open until complete.
    echo.
    docker-compose build
    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to build images.
        echo.
        pause
        exit /b 1
    )
)

echo Starting services...
docker-compose up -d

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start DataForeman.
    echo Check the error messages above for details.
    echo.
    pause
    exit /b 1
)

echo.
echo [3/3] Waiting for services to be ready...
timeout /t 5 /nobreak >nul
docker-compose ps

echo.
echo ========================================
echo   DataForeman is starting up!
echo ========================================
echo.
echo Services are now running in the background.
echo It may take 1-2 minutes for the web interface to be fully ready.
echo.
echo   Frontend: http://localhost:8080
echo   Core API: http://localhost:3000
echo.
echo Press any key to open the application in your browser...
pause >nul

start http://localhost:8080

echo.
echo Window will close in 5 seconds...
echo (Tip: Check 'Service Status' from Start Menu to monitor containers)
timeout /t 5 >nul

echo.
echo To stop DataForeman, run: stop-dataforeman.bat
echo.
