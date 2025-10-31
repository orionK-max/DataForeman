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

REM Get current directory
for /f "tokens=*" %%i in ('cd') do set INSTALL_DIR=%%i

if %SILENT_MODE%==0 (
    echo Current directory: %INSTALL_DIR%
    echo.
    echo Creating and fixing directory permissions in WSL...
    echo.
)

REM Convert Windows path to WSL path (C:\Path -> /mnt/c/Path)
set WSL_PATH=%INSTALL_DIR:\=/%
set WSL_PATH=%WSL_PATH::=%
set DRIVE_LETTER=%INSTALL_DIR:~0,1%
call set DRIVE_LETTER=%%DRIVE_LETTER:A=a%%
call set DRIVE_LETTER=%%DRIVE_LETTER:B=b%%
call set DRIVE_LETTER=%%DRIVE_LETTER:C=c%%
call set DRIVE_LETTER=%%DRIVE_LETTER:D=d%%
call set DRIVE_LETTER=%%DRIVE_LETTER:E=e%%
call set DRIVE_LETTER=%%DRIVE_LETTER:F=f%%
set WSL_PATH=/mnt/%DRIVE_LETTER%%WSL_PATH:~2%

if %SILENT_MODE%==0 echo WSL path: %WSL_PATH%

REM Create directories and fix permissions via WSL
wsl -e bash -c "mkdir -p '%WSL_PATH%/logs' '%WSL_PATH%/var' '%WSL_PATH%/logs/postgres' '%WSL_PATH%/logs/core' '%WSL_PATH%/logs/connectivity' '%WSL_PATH%/logs/front' '%WSL_PATH%/logs/nats' '%WSL_PATH%/logs/ops' '%WSL_PATH%/logs/tsdb' 2>&1"

if errorlevel 1 (
    if %SILENT_MODE%==0 (
        echo.
        echo [ERROR] Could not create directories via WSL
        echo Please ensure Docker Desktop is running and WSL is enabled.
        echo.
        pause
    )
    exit /b 1
)

wsl -e bash -c "chmod -R 777 '%WSL_PATH%/logs' 2>&1"
wsl -e bash -c "chmod -R 755 '%WSL_PATH%/var' 2>&1"

if errorlevel 1 (
    if %SILENT_MODE%==0 (
        echo.
        echo [WARNING] Could not set permissions via WSL
        echo Directories were created but permissions may not be correct.
        echo.
        pause
    )
    exit /b 1
)

if %SILENT_MODE%==0 (
    echo.
    echo ========================================
    echo   Permissions fixed successfully!
    echo ========================================
    echo.
    pause
)
