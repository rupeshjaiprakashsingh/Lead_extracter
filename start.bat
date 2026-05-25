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
echo.
echo  ⚠️  Node.js is not installed on this system and bundled Node.js was not found.
echo  Attempting to install Node.js automatically via Windows Package Manager (winget)...
winget install OpenJS.NodeJS --silent --accept-source-agreements --accept-package-agreements
if errorlevel 1 goto :node_install_fail
echo  ✅ Node.js installed successfully! Please close this window and restart start.bat.
pause
exit /b 0

:node_install_fail
echo  ❌ ERROR: Automated Node.js installation failed.
echo  Please manually install Node.js (LTS version) from https://nodejs.org/
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
echo MONGO_URI=mongodb://YOUR_DB_USER:YOUR_DB_PASSWORD@ac-ielsbkk-shard-00-00.ahj3x8j.mongodb.net:27017,ac-ielsbkk-shard-00-01.ahj3x8j.mongodb.net:27017,ac-ielsbkk-shard-00-02.ahj3x8j.mongodb.net:27017/lead_automation?ssl=true^&replicaSet=atlas-dm8oc5-shard-0^&authSource=admin^&retryWrites=true^&w=majority > "%APP_DIR%\.env"
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
