@echo off
title Lead Automation CRM SaaS — Installer
color 0A
chcp 65001 >nul

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║       LEAD AUTOMATION CRM — SaaS Installer          ║
echo  ║           Multi-Tenant Edition v2.0                  ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

:: ── Step 1: Check Node.js ─────────────────────────────────────
echo  [1/7] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ❌ ERROR: Node.js not found!
    echo  Please install Node.js v18+ from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  ✅ Node.js %NODE_VER% found

:: ── Step 2: Check MongoDB ─────────────────────────────────────
echo.
echo  [2/7] Checking MongoDB...
mongod --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ⚠️  MongoDB not found in PATH.
    echo  Checking if MongoDB service is running...
    sc query MongoDB >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo  ❌ MongoDB service not found!
        echo  Please install MongoDB Community Edition from:
        echo  https://www.mongodb.com/try/download/community
        echo.
        echo  After installing MongoDB, run this installer again.
        pause
        exit /b 1
    ) else (
        echo  ✅ MongoDB service found
    )
) else (
    echo  ✅ MongoDB found
)

:: ── Step 3: Install Backend Dependencies ─────────────────────
echo.
echo  [3/7] Installing backend dependencies...
cd /d "%APP_DIR%backend"
if not exist "node_modules\" (
    call npm install
    if %errorlevel% neq 0 (
        echo  ❌ Failed to install backend dependencies.
        pause
        exit /b 1
    )
    echo  ✅ Backend dependencies installed
) else (
    echo  ✅ Backend dependencies already installed
)

:: ── Step 4: Install Frontend Dependencies ────────────────────
echo.
echo  [4/7] Installing frontend dependencies...
cd /d "%APP_DIR%frontend"
if not exist "node_modules\" (
    call npm install
    if %errorlevel% neq 0 (
        echo  ❌ Failed to install frontend dependencies.
        pause
        exit /b 1
    )
    echo  ✅ Frontend dependencies installed
) else (
    echo  ✅ Frontend dependencies already installed
)

:: ── Step 5: Create .env file ──────────────────────────────────
echo.
echo  [5/7] Setting up environment configuration...
cd /d "%APP_DIR%backend"
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo  ✅ Created backend/.env from template
    echo.
    echo  ⚠️  IMPORTANT: Edit backend\.env to set your:
    echo     - JWT_SECRET (change to random string)
    echo     - JWT_REFRESH_SECRET (change to random string)
    echo     - SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD
    echo     - MONGO_URI (if not using localhost)
    echo.
) else (
    echo  ✅ backend/.env already exists
)

:: ── Step 6: Install Playwright Browsers ──────────────────────
echo.
echo  [6/7] Installing Playwright browsers...
cd /d "%APP_DIR%backend"
call npx playwright install chromium
if %errorlevel% neq 0 (
    echo  ⚠️  Playwright browser install may have issues. WhatsApp automation may not work.
) else (
    echo  ✅ Playwright Chromium browser installed
)

:: ── Step 7: Seed Database ─────────────────────────────────────
echo.
echo  [7/7] Setting up database (SuperAdmin + Plans)...
cd /d "%APP_DIR%backend"
call node scripts/seed.js
if %errorlevel% neq 0 (
    echo  ⚠️  Database seed encountered an issue.
    echo      This may be normal if already seeded.
) else (
    echo  ✅ Database seeded successfully
)

:: ── Complete! ─────────────────────────────────────────────────
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║              ✅ INSTALLATION COMPLETE!               ║
echo  ╠══════════════════════════════════════════════════════╣
echo  ║  Run START-SAAS.bat to launch the application       ║
echo  ║                                                      ║
echo  ║  Default SuperAdmin login:                           ║
echo  ║    URL:      http://localhost:3000                   ║
echo  ║    Username: superadmin                              ║
echo  ║    Password: Admin@123456                            ║
echo  ║                                                      ║
echo  ║  ⚠️  CHANGE PASSWORD after first login!              ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
pause
