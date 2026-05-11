@echo off
title CRM Instance 2 - Port 3001
color 0B
echo.
echo  ====================================================
echo    CRM INSTANCE 2  -  http://localhost:3001
echo  ====================================================
echo.

set "NODE=C:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
set "APP=C:\Rupesh\Lead_extracter\lead-automation\index.js"
set PORT=3001
set NO_BROWSER=1

cd /d "C:\Rupesh\Lead_extracter\lead-automation"

echo  [CHECK] Node path: %NODE%
echo  [CHECK] App path:  %APP%
echo.

if not exist "%NODE%" (
    echo  ERROR: node.exe not found at %NODE%
    pause
    exit /b 1
)

echo  Starting Instance 2 on port 3001...
echo  Dashboard: http://localhost:3001
echo.
"%NODE%" "%APP%"
pause
