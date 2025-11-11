@echo off
REM Test script to verify DataForeman permission fixes work correctly
REM This creates test files in all the directories that Docker needs to write to

echo.
echo ========================================
echo   Testing DataForeman Permissions
echo ========================================
echo.

cd /d "%~dp0.."

echo Testing directory write permissions...
echo.

REM List of directories to test
set "TEST_DIRS=logs logs\postgres logs\core logs\connectivity logs\front logs\ingestor logs\nats logs\ops logs\tsdb var"

set "ALL_TESTS_PASSED=1"

for %%d in (%TEST_DIRS%) do (
    if exist "%%d" (
        echo test > "%%d\permission_test.tmp" 2>nul
        if errorlevel 1 (
            echo [FAIL] Cannot write to: %%d
            set "ALL_TESTS_PASSED=0"
        ) else (
            echo [PASS] Can write to: %%d
            del "%%d\permission_test.tmp" 2>nul
        )
    ) else (
        echo [FAIL] Directory missing: %%d
        set "ALL_TESTS_PASSED=0"
    )
)

echo.
if "%ALL_TESTS_PASSED%"=="1" (
    echo ========================================
    echo   All permission tests PASSED!
    echo ========================================
    echo.
    echo DataForeman should be able to start successfully.
) else (
    echo ========================================
    echo   Some permission tests FAILED!
    echo ========================================
    echo.
    echo Run one of the following to fix permissions:
    echo   fix-permissions.bat
    echo   fix-permissions.ps1 ^(as Administrator^)
    echo   diagnose-permissions.ps1 ^(for detailed analysis^)
)

echo.
pause