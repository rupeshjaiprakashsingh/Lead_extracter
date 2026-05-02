@echo off
title Lead Automation Tool
echo.
echo  ============================================
echo   LEAD AUTOMATION TOOL - Starting...
echo  ============================================
echo.

set "NODE_PATH=C:\Users\srupesh\.gemini\antigravity\scratch\node\node-v20.19.1-win-x64"
set "PATH=%NODE_PATH%;%PATH%"
set "APP_DIR=C:\Users\srupesh\.gemini\antigravity\scratch\lead-automation"

cd /d "%APP_DIR%"

echo  [1/2] Checking Node.js...
node --version
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not found!
    pause
    exit /b 1
)

echo  [2/2] Starting server...
echo.
echo  Opening dashboard at: http://localhost:3000
echo.
node index.js

pause
