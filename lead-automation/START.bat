@echo off
title Lead Automation Tool
echo.
echo  ============================================
echo   LEAD AUTOMATION TOOL - Starting...
echo  ============================================
echo.

set "NODE_PATH=%~dp0..\node\node-v20.19.1-win-x64"
set "APP_DIR=%~dp0"

cd /d "%APP_DIR%"

echo  [1/4] Checking Node.js...

:: Check if bundled node exists and has npm
if exist "%NODE_PATH%\node.exe" if exist "%NODE_PATH%\node_modules\npm\bin\npm-cli.js" (
    echo  Using bundled Node.js...
    set "PATH=%NODE_PATH%;%PATH%"
) else (
    echo  Bundled Node.js is missing or incomplete. Using system Node.js...
)

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not found! Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

node --version

echo  [2/4] Checking dependencies...
if not exist "node_modules\" (
    echo  Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo  ERROR: Failed to install dependencies.
        pause
        exit /b 1
    )
) else (
    echo  Dependencies already installed.
)

echo  [3/4] Checking Playwright browsers...
call npx playwright install chromium
if %errorlevel% neq 0 (
    echo  WARNING: Playwright browser installation might have failed.
)

echo  [4/4] Starting server...
echo.
echo  Opening dashboard at: http://localhost:3000
echo.
node index.js

pause
