@echo off
title Lead Automation CRM SaaS — Starting...
color 0B
chcp 65001 >nul

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║       LEAD AUTOMATION CRM — SaaS Edition            ║
echo  ║           Starting All Services...                   ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

:: ── Check .env exists ────────────────────────────────────────
if not exist "backend\.env" (
    echo  ❌ backend\.env not found!
    echo  Please run install.bat first.
    pause
    exit /b 1
)

:: ── Start MongoDB if not running ─────────────────────────────
echo  [1/3] Checking MongoDB...
mongod --version >nul 2>&1
if %errorlevel% equ 0 (
    echo  Starting MongoDB...
    start /min "MongoDB" mongod --dbpath "%APP_DIR%data\db" --logpath "%APP_DIR%data\mongod.log"
    timeout /t 2 /nobreak >nul
    echo  ✅ MongoDB starting
) else (
    sc query MongoDB >nul 2>&1
    if %errorlevel% equ 0 (
        net start MongoDB >nul 2>&1
        echo  ✅ MongoDB service started
    ) else (
        echo  ⚠️  MongoDB may already be running or not installed
    )
)

:: ── Create MongoDB data directory ────────────────────────────
if not exist "%APP_DIR%data\db\" mkdir "%APP_DIR%data\db"

:: ── Start Backend ────────────────────────────────────────────
echo.
echo  [2/3] Starting Backend API (Port 5000)...
start "CRM Backend (Port 5000)" cmd /k "cd /d %APP_DIR%backend && node server.js"
timeout /t 3 /nobreak >nul
echo  ✅ Backend starting on http://localhost:5000

:: ── Start Frontend ───────────────────────────────────────────
echo.
echo  [3/3] Starting Frontend (Port 3000)...
start "CRM Frontend (Port 3000)" cmd /k "cd /d %APP_DIR%frontend && npm run dev"
timeout /t 5 /nobreak >nul
echo  ✅ Frontend starting on http://localhost:3000

:: ── Open Browser ─────────────────────────────────────────────
echo.
echo  Opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║              ✅ ALL SERVICES STARTED!                ║
echo  ╠══════════════════════════════════════════════════════╣
echo  ║  Frontend:  http://localhost:3000                    ║
echo  ║  Backend:   http://localhost:5000                    ║
echo  ║  MongoDB:   mongodb://localhost:27017                ║
echo  ║                                                      ║
echo  ║  Close this window to keep services running.        ║
echo  ║  Close the Backend/Frontend windows to stop.        ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
pause
