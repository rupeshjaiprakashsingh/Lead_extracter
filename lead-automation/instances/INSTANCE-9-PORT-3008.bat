@echo off
title CRM Instance 9 - Port 3008
color 09
echo.
echo  ====================================================
echo    CRM INSTANCE 9  -  http://localhost:3008
echo  ====================================================
echo.

set "NODE=C:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
set "APP=C:\Rupesh\Lead_extracter\lead-automation\index.js"
set PORT=3008
set NO_BROWSER=1

cd /d "C:\Rupesh\Lead_extracter\lead-automation"

if not exist "%NODE%" ( echo  ERROR: node.exe not found & pause & exit /b 1 )

echo  Starting Instance 9 on port 3008...
echo  Dashboard: http://localhost:3008
echo.
"%NODE%" "%APP%"
pause
