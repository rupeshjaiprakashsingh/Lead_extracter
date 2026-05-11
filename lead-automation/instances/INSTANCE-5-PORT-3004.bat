@echo off
title CRM Instance 5 - Port 3004
color 0E
echo.
echo  ====================================================
echo    CRM INSTANCE 5  -  http://localhost:3004
echo  ====================================================
echo.

set "NODE=C:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
set "APP=C:\Rupesh\Lead_extracter\lead-automation\index.js"
set PORT=3004
set NO_BROWSER=1

cd /d "C:\Rupesh\Lead_extracter\lead-automation"

if not exist "%NODE%" ( echo  ERROR: node.exe not found & pause & exit /b 1 )

echo  Starting Instance 5 on port 3004...
echo  Dashboard: http://localhost:3004
echo.
"%NODE%" "%APP%"
pause
