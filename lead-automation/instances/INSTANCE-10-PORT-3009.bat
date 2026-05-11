@echo off
title CRM Instance 10 - Port 3009
color 04
echo.
echo  ====================================================
echo    CRM INSTANCE 10  -  http://localhost:3009
echo  ====================================================
echo.

set "NODE=C:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
set "APP=C:\Rupesh\Lead_extracter\lead-automation\index.js"
set PORT=3009
set NO_BROWSER=1

cd /d "C:\Rupesh\Lead_extracter\lead-automation"

if not exist "%NODE%" ( echo  ERROR: node.exe not found & pause & exit /b 1 )

echo  Starting Instance 10 on port 3009...
echo  Dashboard: http://localhost:3009
echo.
"%NODE%" "%APP%"
pause
