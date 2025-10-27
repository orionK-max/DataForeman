@echo off
REM DataForeman Launcher for Windows
REM This script starts the DataForeman application using Docker Compose

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

REM Check and fix permissions if needed (silent check)
echo [1.5/3] Verifying directory permissions...
powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0fix-permissions.ps1" >nul 2>&1

echo [2/3] Starting DataForeman services...
docker-compose up -d

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start DataForeman.
    echo Check the error messages above for details.
    echo.
    pause
    exit /b 1
)

echo [3/3] Verifying services...
timeout /t 3 /nobreak >nul
docker-compose ps

echo.
echo ========================================
echo   DataForeman is now running!
echo ========================================
echo.
echo   Frontend: http://localhost:8080
echo   Core API: http://localhost:3000
echo.
echo Press any key to open the application in your browser...
pause >nul

start http://localhost:8080

echo.
echo To stop DataForeman, run: stop-dataforeman.bat
echo.
