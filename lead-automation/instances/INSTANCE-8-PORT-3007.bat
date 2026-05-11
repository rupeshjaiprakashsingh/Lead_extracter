@echo off
title CRM Instance 8 - Port 3007
color 06
echo.
echo  ====================================================
echo    CRM INSTANCE 8  -  http://localhost:3007
echo  ====================================================
echo.

set "NODE=C:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
set "APP=C:\Rupesh\Lead_extracter\lead-automation\index.js"
set PORT=3007
set NO_BROWSER=1

cd /d "C:\Rupesh\Lead_extracter\lead-automation"

if not exist "%NODE%" ( echo  ERROR: node.exe not found & pause & exit /b 1 )

echo  Starting Instance 8 on port 3007...
echo  Dashboard: http://localhost:3007
echo.
"%NODE%" "%APP%"
pause
