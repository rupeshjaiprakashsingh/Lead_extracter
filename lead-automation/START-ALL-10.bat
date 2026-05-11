@echo off
title Lead CRM - 10 Instances Launcher
color 0A

echo.
echo  ============================================================
echo    LEAD CRM - LAUNCHING ALL 10 INSTANCES
echo    Ports: 3000 to 3009
echo  ============================================================
echo.

set "NODE=%~dp0..\node\node-v20.19.1-win-x64\node.exe"
set "APP=%~dp0index.js"
set "DIR=%~dp0"

REM -- Kill any existing node processes
echo  [*] Stopping any existing instances...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo  [*] Starting 10 instances...
echo.

REM -- Instance 1 - Port 3000 (opens browser)
start "CRM Instance 1 - Port 3000" cmd /k "set PORT=3000 && set NO_BROWSER= && cd /d "%DIR%" && "%NODE%" "%APP%""
echo  [OK] Instance 1  started on http://localhost:3000
timeout /t 1 /nobreak >nul

REM -- Instance 2 - Port 3001
start "CRM Instance 2 - Port 3001" cmd /k "set PORT=3001 && set NO_BROWSER=1 && cd /d "%DIR%" && "%NODE%" "%APP%""
echo  [OK] Instance 2  started on http://localhost:3001
timeout /t 1 /nobreak >nul

REM -- Instance 3 - Port 3002
start "CRM Instance 3 - Port 3002" cmd /k "set PORT=3002 && set NO_BROWSER=1 && cd /d "%DIR%" && "%NODE%" "%APP%""
echo  [OK] Instance 3  started on http://localhost:3002
timeout /t 1 /nobreak >nul

REM -- Instance 4 - Port 3003
start "CRM Instance 4 - Port 3003" cmd /k "set PORT=3003 && set NO_BROWSER=1 && cd /d "%DIR%" && "%NODE%" "%APP%""
echo  [OK] Instance 4  started on http://localhost:3003
timeout /t 1 /nobreak >nul

REM -- Instance 5 - Port 3004
start "CRM Instance 5 - Port 3004" cmd /k "set PORT=3004 && set NO_BROWSER=1 && cd /d "%DIR%" && "%NODE%" "%APP%""
echo  [OK] Instance 5  started on http://localhost:3004
timeout /t 1 /nobreak >nul

REM -- Instance 6 - Port 3005
start "CRM Instance 6 - Port 3005" cmd /k "set PORT=3005 && set NO_BROWSER=1 && cd /d "%DIR%" && "%NODE%" "%APP%""
echo  [OK] Instance 6  started on http://localhost:3005
timeout /t 1 /nobreak >nul

REM -- Instance 7 - Port 3006
start "CRM Instance 7 - Port 3006" cmd /k "set PORT=3006 && set NO_BROWSER=1 && cd /d "%DIR%" && "%NODE%" "%APP%""
echo  [OK] Instance 7  started on http://localhost:3006
timeout /t 1 /nobreak >nul

REM -- Instance 8 - Port 3007
start "CRM Instance 8 - Port 3007" cmd /k "set PORT=3007 && set NO_BROWSER=1 && cd /d "%DIR%" && "%NODE%" "%APP%""
echo  [OK] Instance 8  started on http://localhost:3007
timeout /t 1 /nobreak >nul

REM -- Instance 9 - Port 3008
start "CRM Instance 9 - Port 3008" cmd /k "set PORT=3008 && set NO_BROWSER=1 && cd /d "%DIR%" && "%NODE%" "%APP%""
echo  [OK] Instance 9  started on http://localhost:3008
timeout /t 1 /nobreak >nul

REM -- Instance 10 - Port 3009
start "CRM Instance 10 - Port 3009" cmd /k "set PORT=3009 && set NO_BROWSER=1 && cd /d "%DIR%" && "%NODE%" "%APP%""
echo  [OK] Instance 10 started on http://localhost:3009
timeout /t 1 /nobreak >nul

echo.
echo  ============================================================
echo   ALL 10 INSTANCES LAUNCHED!
echo  ============================================================
echo.
echo   Instance 1:  http://localhost:3000
echo   Instance 2:  http://localhost:3001
echo   Instance 3:  http://localhost:3002
echo   Instance 4:  http://localhost:3003
echo   Instance 5:  http://localhost:3004
echo   Instance 6:  http://localhost:3005
echo   Instance 7:  http://localhost:3006
echo   Instance 8:  http://localhost:3007
echo   Instance 9:  http://localhost:3008
echo   Instance 10: http://localhost:3009
echo.
echo  [*] Opening Control Panel in browser...
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000/multi-control.html"

echo.
echo  Press any key to STOP ALL instances and close...
pause >nul

echo  [*] Stopping all instances...
taskkill /F /IM node.exe >nul 2>&1
echo  [OK] All instances stopped.
timeout /t 2 /nobreak >nul
