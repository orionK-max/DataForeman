@echo off
REM DataForeman Status Script for Windows
REM This script shows the status of DataForeman services

echo.
echo ========================================
echo   DataForeman - Service Status
echo ========================================
echo.

REM Change to the DataForeman installation directory
cd /d "%~dp0.."

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running!
    echo.
    echo Please start Docker Desktop to check DataForeman status.
    echo.
    pause
    exit /b 1
)

echo Current status of DataForeman services:
echo.
docker-compose ps

echo.
echo ========================================
echo.

REM Check if services are running
docker-compose ps | findstr "Up" >nul
if errorlevel 1 (
    echo Status: STOPPED
    echo.
    echo To start DataForeman, run: start-dataforeman.bat
) else (
    echo Status: RUNNING
    echo.
    echo   Frontend: http://localhost:8080
    echo   Core API: http://localhost:3000
    echo.
    echo To stop DataForeman, run: stop-dataforeman.bat
)

echo.
pause
