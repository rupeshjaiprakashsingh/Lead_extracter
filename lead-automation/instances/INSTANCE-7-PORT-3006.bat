@echo off
title CRM Instance 7 - Port 3006
color 05
echo.
echo  ====================================================
echo    CRM INSTANCE 7  -  http://localhost:3006
echo  ====================================================
echo.

set "NODE=C:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
set "APP=C:\Rupesh\Lead_extracter\lead-automation\index.js"
set PORT=3006
set NO_BROWSER=1

cd /d "C:\Rupesh\Lead_extracter\lead-automation"

if not exist "%NODE%" ( echo  ERROR: node.exe not found & pause & exit /b 1 )

echo  Starting Instance 7 on port 3006...
echo  Dashboard: http://localhost:3006
echo.
"%NODE%" "%APP%"
pause
