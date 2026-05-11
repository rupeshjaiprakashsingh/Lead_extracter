@echo off
title CRM Instance 3 - Port 3002
color 0C
echo.
echo  ====================================================
echo    CRM INSTANCE 3  -  http://localhost:3002
echo  ====================================================
echo.

set "NODE=C:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
set "APP=C:\Rupesh\Lead_extracter\lead-automation\index.js"
set PORT=3002
set NO_BROWSER=1

cd /d "C:\Rupesh\Lead_extracter\lead-automation"

if not exist "%NODE%" ( echo  ERROR: node.exe not found & pause & exit /b 1 )

echo  Starting Instance 3 on port 3002...
echo  Dashboard: http://localhost:3002
echo.
"%NODE%" "%APP%"
pause
