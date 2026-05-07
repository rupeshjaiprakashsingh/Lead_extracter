@echo off
title Lead Automation Tool
echo.
echo  ============================================
echo   LEAD AUTOMATION TOOL - Starting...
echo  ============================================
echo.

set "NODE_PATH=%~dp0..\node\node-v20.19.1-win-x64"
set "PATH=%NODE_PATH%;%PATH%"
set "APP_DIR=%~dp0"

cd /d "%APP_DIR%"

echo  [1/4] Checking Node.js...
node --version
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not found!
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo  [2/4] Installing dependencies...
    call npm install

    echo  [3/4] Installing Playwright browsers...
    call npx playwright install
) else (
    echo  [2/4] Dependencies already installed, skipping...
    echo  [3/4] Playwright browsers already installed, skipping...
)

echo  [4/4] Starting server...
echo.
echo  Opening dashboard at: http://localhost:3000
echo.
node index.js

pause
