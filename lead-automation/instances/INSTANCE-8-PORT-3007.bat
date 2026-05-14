@echo off
title CRM Instance 8 - Port 3007
color 0B
echo.
echo  ====================================================
echo    CRM INSTANCE 8  -  http://localhost:3007
echo  ====================================================
echo.

set "NODE_DIR=%~dp0..\..\node\node-v20.19.1-win-x64"
set "APP_DIR=%~dp0.."
set "APP_JS=%APP_DIR%\index.js"
set "PORT=3007"
set "NO_BROWSER=1"

cd /d "%APP_DIR%"

:: Check if bundled node exists
if exist "%NODE_DIR%\node.exe" (
    set "NODE_EXE=%NODE_DIR%\node.exe"
) else (
    set "NODE_EXE=node"
)

echo  [CHECK] Using Node: %NODE_EXE%
echo  [CHECK] App path:  %APP_JS%
echo.

echo  Starting Instance 8 on port 3007...
echo.

"%NODE_EXE%" "%APP_JS%"
pause
