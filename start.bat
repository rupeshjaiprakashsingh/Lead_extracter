@echo off
title Lead Automation CRM
echo.
echo  ================================══════════════════════
echo   LEAD AUTOMATION CRM — Bootstrapping and Starting
echo  ================================══════════════════════
echo.

set "ROOT_DIR=%~dp0"
set "APP_DIR=%ROOT_DIR%lead-automation"
set "NODE_PATH="

:: Discover dynamic portable Node directory if it exists and has npm
for /d %%d in ("%ROOT_DIR%node\*") do (
    if exist "%%d\node.exe" (
        if exist "%%d\node_modules\npm\bin\npm-cli.js" (
            set "NODE_PATH=%%d"
            goto :node_path_resolved
        )
    )
)
:node_path_resolved

:: ── Step 1: Add Bundled Node to PATH ──────────────────────
echo  [1/5] Configuring portable Node.js environment...
if defined NODE_PATH if exist "%NODE_PATH%\node.exe" goto :node_found
echo  ⚠️  Bundled Node.js not found in %ROOT_DIR%node.
echo  Attempting to use system-installed Node.js...
goto :check_node

:node_found
echo  ✅ Found bundled Node.js at %NODE_PATH%
set "PATH=%NODE_PATH%;%PATH%"

:check_node
node --version >nul 2>&1
if not errorlevel 1 goto :node_ok
echo  ❌ ERROR: Node.js is not installed and bundled Node.js was not found.
echo  Please install Node.js from https://nodejs.org/ or ensure the 'node' folder exists.
pause
exit /b 1

:node_ok
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  Using Node.js %NODE_VER%

:: ── Step 2: Set up environment variables ────────────────────
echo.
echo  [2/5] Setting up environment variables...
if exist "%APP_DIR%\.env" goto :env_exists
if exist "%ROOT_DIR%.env.example" goto :copy_example
echo MONGO_URI=mongodb+srv://rupeshwork72:Gate%%40air7208@mern-cluster.ahj3x8j.mongodb.net/lead_automation?appName=mern-cluster > "%APP_DIR%\.env"
echo  ✅ Created basic lead-automation/.env file
goto :env_done

:copy_example
copy "%ROOT_DIR%.env.example" "%APP_DIR%\.env" >nul
echo  ✅ Created default lead-automation/.env file from template
goto :env_done

:env_exists
echo  ✅ lead-automation/.env already exists.

:env_done

:: ── Step 3: Install Node Dependencies ──────────────────────
echo.
echo  [3/5] Checking application dependencies in %APP_DIR%...
cd /d "%APP_DIR%"
if exist "node_modules" goto :dependencies_ok
echo  node_modules not found. Installing dependencies (this may take a minute)...
call npm install
if errorlevel 1 goto :dependencies_fail
echo  ✅ Dependencies installed successfully!
goto :dependencies_ok

:dependencies_fail
echo  ❌ ERROR: Failed to install NPM dependencies.
pause
exit /b 1

:dependencies_ok
echo  ✅ Dependencies verified.

:: ── Step 4: Install Playwright Browsers ────────────────────
echo.
echo  [4/5] Checking Playwright browser binaries...
call npx playwright install chromium
if errorlevel 1 goto :playwright_fail
echo  ✅ Playwright chromium browser verified.
goto :playwright_done

:playwright_fail
echo  ⚠️  WARNING: Playwright chromium installation finished with an error.
echo  WhatsApp/Scraper browser automation might have issues if browser binaries are missing.

:playwright_done

:: ── Step 5: Run Application ────────────────────────────────
echo.
echo  [5/5] Starting the CRM Server...
echo  ------------------------------------------------------
echo   Dashboard will open automatically at http://localhost:3000
echo  ------------------------------------------------------
echo.

node index.js
pause
