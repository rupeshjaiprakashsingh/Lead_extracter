@echo off
title CRM Instance 6 - Port 3005
color 03
echo.
echo  ====================================================
echo    CRM INSTANCE 6  -  http://localhost:3005
echo  ====================================================
echo.

set "NODE=C:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
set "APP=C:\Rupesh\Lead_extracter\lead-automation\index.js"
set PORT=3005
set NO_BROWSER=1

cd /d "C:\Rupesh\Lead_extracter\lead-automation"

if not exist "%NODE%" ( echo  ERROR: node.exe not found & pause & exit /b 1 )

echo  Starting Instance 6 on port 3005...
echo  Dashboard: http://localhost:3005
echo.
"%NODE%" "%APP%"
pause
