@echo off
title CRM Instance 1 - Port 3000
color 0A
echo.
echo  ====================================================
echo    CRM INSTANCE 1  -  http://localhost:3000
echo    (Opens browser automatically)
echo  ====================================================
echo.

set "NODE_DIR=%~dp0..\..\node\node-v20.19.1-win-x64"
set "APP_DIR=%~dp0.."
set "APP_JS=%APP_DIR%\index.js"
set "PORT=3000"

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

echo  Starting Instance 1 on port 3000...
echo  Browser will open automatically...
echo.

"%NODE_EXE%" "%APP_JS%"
pause
