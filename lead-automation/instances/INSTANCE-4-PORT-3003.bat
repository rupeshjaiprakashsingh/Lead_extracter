@echo off
title CRM Instance 4 - Port 3003
color 0D
echo.
echo  ====================================================
echo    CRM INSTANCE 4  -  http://localhost:3003
echo  ====================================================
echo.

set "NODE=C:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
set "APP=C:\Rupesh\Lead_extracter\lead-automation\index.js"
set PORT=3003
set NO_BROWSER=1

cd /d "C:\Rupesh\Lead_extracter\lead-automation"

if not exist "%NODE%" ( echo  ERROR: node.exe not found & pause & exit /b 1 )

echo  Starting Instance 4 on port 3003...
echo  Dashboard: http://localhost:3003
echo.
"%NODE%" "%APP%"
pause
