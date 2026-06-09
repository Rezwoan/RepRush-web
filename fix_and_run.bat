@echo off
title RepRush - Fix and Run
color 0A
echo ============================================
echo   RepRush - Clean Install and Start
echo ============================================
echo.

echo [1/6] Cleaning backend node_modules...
cd /d E:\RepRush\backend
if exist node_modules (
    rmdir /s /q node_modules
    echo     Done.
) else (
    echo     Already clean.
)

echo.
echo [2/6] Installing backend dependencies (sql.js - no native compile needed)...
call npm install --no-audit --no-fund
if %ERRORLEVEL% neq 0 (
    echo.
    echo     ERROR: Backend npm install failed!
    pause
    exit /b 1
)
echo     Done.

echo.
echo [3/6] Creating database directory...
if not exist "E:\RepRush\backend\database" (
    mkdir "E:\RepRush\backend\database"
    echo     Created.
) else (
    echo     Already exists.
)

echo.
echo [4/6] Installing frontend dependencies...
cd /d E:\RepRush\frontend
if not exist node_modules (
    call npm install --no-audit --no-fund
    if %ERRORLEVEL% neq 0 (
        echo.
        echo     ERROR: Frontend npm install failed!
        pause
        exit /b 1
    )
    echo     Done.
) else (
    echo     Already installed, skipping.
)

echo.
echo [5/6] Starting backend server (port 3001)...
start "RepRush Backend :3001" cmd /k "cd /d E:\RepRush\backend && npm run start:dev"

echo.
echo [6/6] Waiting 8s then starting frontend server (port 3000)...
timeout /t 8 /nobreak >nul
start "RepRush Frontend :3000" cmd /k "cd /d E:\RepRush\frontend && npm run dev"

echo.
echo ============================================
echo   Both servers are starting!
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:3000
echo ============================================
echo   Wait ~30 seconds for compilation,
echo   then open http://localhost:3000
echo ============================================
pause
