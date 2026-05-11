@echo off
title Lead CRM - Starting 10 Instances
echo.
echo ============================================================
echo   LEAD CRM - Launching 10 Instances (Ports 3000-3009)
echo ============================================================
echo.

PowerShell -ExecutionPolicy Bypass -File "%~dp0start-multi.ps1"

pause
