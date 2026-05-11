@echo off
title CRM Instance 1 - Port 3000
color 0A
echo.
echo  ====================================================
echo    CRM INSTANCE 1  -  http://localhost:3000
echo    (Opens browser automatically)
echo  ====================================================
echo.

set "NODE=C:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
set "APP=C:\Rupesh\Lead_extracter\lead-automation\index.js"
set PORT=3000

cd /d "C:\Rupesh\Lead_extracter\lead-automation"

echo  [CHECK] Node path: %NODE%
echo  [CHECK] App path:  %APP%
echo.

if not exist "%NODE%" (
    echo  ERROR: node.exe not found at %NODE%
    echo  Please check your Node.js installation path.
    pause
    exit /b 1
)

echo  Starting Instance 1 on port 3000...
echo  Browser will open automatically...
echo.
"%NODE%" "%APP%"
pause
