@echo off
title Lead Automation CRM SaaS — Setup Wizard
color 0E
chcp 65001 >nul

echo.
echo  ╔══════════════════════════════════════════════════════╗
2: echo  ║       LEAD AUTOMATION CRM — SaaS Setup Wizard        ║
3: echo  ║          Configure your Multi-Tenant Tenant          ║
4: echo  ╚══════════════════════════════════════════════════════╝
5: echo.

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

:: ── Check .env template ──────────────────────────────────────────
if not exist "backend\.env.example" (
    echo  ❌ ERROR: backend\.env.example not found. Please restore this file.
    pause
    exit /b 1
)

:: ── Create .env if not exists ────────────────────────────────────
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env" >nul
)

echo  This wizard will guide you through setting up your SaaS backend configuration.
echo  Press ENTER to keep the current value shown in square brackets [].
echo.

:: ── Load current values if they exist ────────────────────────────
set "CURR_PORT=5000"
set "CURR_MONGO_URI=mongodb://localhost:27017/lead_automation_saas"
set "CURR_EMAIL=admin@yourdomain.com"
set "CURR_PASS=Admin@123456"

if exist "backend\.env" (
    for /f "tokens=1,2 delims==" %%A in (backend\.env) do (
        if "%%A"=="PORT" set "CURR_PORT=%%B"
        if "%%A"=="MONGO_URI" set "CURR_MONGO_URI=%%B"
        if "%%A"=="SUPERADMIN_EMAIL" set "CURR_EMAIL=%%B"
        if "%%A"=="SUPERADMIN_PASSWORD" set "CURR_PASS=%%B"
    )
)

:: ── Prompt user ──────────────────────────────────────────────────
set /p "NEW_PORT=Port for backend server [%CURR_PORT%]: "
if "%NEW_PORT%"=="" set "NEW_PORT=%CURR_PORT%"

set /p "NEW_MONGO=MongoDB connection URI [%CURR_MONGO_URI%]: "
if "%NEW_MONGO%"=="" set "NEW_MONGO=%CURR_MONGO_URI%"

set /p "NEW_EMAIL=SuperAdmin Initial Email [%CURR_EMAIL%]: "
if "%NEW_EMAIL%"=="" set "NEW_EMAIL=%CURR_EMAIL%"

set /p "NEW_PASS=SuperAdmin Initial Password [%CURR_PASS%]: "
if "%NEW_PASS%"=="" set "NEW_PASS=%CURR_PASS%"

:: ── Generate random JWT secrets ──────────────────────────────────
set "RAND_SECRET1="
set "RAND_SECRET2="
for /f "tokens=2 delims=:" %%A in ('powershell -Command "[guid]::NewGuid().ToString()"') do set "RAND_SECRET1=%%A"
if "%RAND_SECRET1%"=="" set "RAND_SECRET1=secret_key_%random%_%random%"
for /f "tokens=2 delims=:" %%A in ('powershell -Command "[guid]::NewGuid().ToString()"') do set "RAND_SECRET2=%%A"
if "%RAND_SECRET2%"=="" set "RAND_SECRET2=secret_key_%random%_%random%"

:: ── Write back .env ──────────────────────────────────────────────
echo.
echo  Writing configuration backend\.env...

(
echo # ── Server ─────────────────────────────────────────────────────
echo NODE_ENV=production
echo PORT=%NEW_PORT%
echo.
echo # ── MongoDB ────────────────────────────────────────────────────
echo MONGO_URI=%NEW_MONGO%
echo.
echo # ── JWT ────────────────────────────────────────────────────────
echo JWT_SECRET=%RAND_SECRET1%
echo JWT_EXPIRES_IN=7d
echo JWT_REFRESH_SECRET=%RAND_SECRET2%
echo JWT_REFRESH_EXPIRES_IN=30d
echo.
echo # ── Frontend ───────────────────────────────────────────────────
echo FRONTEND_URL=http://localhost:3000
echo.
echo # ── SuperAdmin Seed Credentials ────────────────────────────────
echo SUPERADMIN_EMAIL=%NEW_EMAIL%
echo SUPERADMIN_PASSWORD=%NEW_PASS%
) > "backend\.env"

echo  ✅ backend\.env generated!
echo.

:: ── Offer Seeding ────────────────────────────────────────────────
echo  [Option 1] Seed a clean database (default plans, superadmin, demo company)
echo  [Option 2] Run migration script on existing single-tenant CRM data
echo  [Option 3] Do nothing
echo.
set /p "CHOICE=Select option [1, 2, or 3]: "

if "%CHOICE%"=="1" (
    echo.
    echo  Running database seed script...
    cd /d "%APP_DIR%backend"
    call node scripts/seed.js
)
if "%CHOICE%"=="2" (
    echo.
    echo  Running migration script...
    cd /d "%APP_DIR%backend"
    call node scripts/migrate.js
)

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║               ✅ SETUP CONFIGURATION DONE!           ║
echo  ║  You are ready to run START-SAAS.bat to launch app!   ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
pause
