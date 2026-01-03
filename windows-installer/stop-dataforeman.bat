@echo off
REM DataForeman Stop Script for Windows
REM This script stops all DataForeman services

echo.
echo ========================================
echo   DataForeman - Stopping Application
echo ========================================
echo.

REM Change to the DataForeman installation directory
cd /d "%~dp0.."

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Docker is not running.
    echo DataForeman services are already stopped.
    echo.
    pause
    exit /b 0
)

echo Stopping all DataForeman services...
docker compose down

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to stop DataForeman.
    echo Check the error messages above for details.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   DataForeman has been stopped.
echo ========================================
echo.
echo Note: Your data is safely preserved in Docker volumes.
echo To start DataForeman again, run: start-dataforeman.bat
echo.
pause
