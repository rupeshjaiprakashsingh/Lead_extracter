# ============================================================
#  start-multi.ps1 — Launch Multiple CRM Instances
#  Each instance runs on a different port (3000–3009)
#  All share the same MongoDB database
# ============================================================

$NODE = "c:\Rupesh\Lead_extracter\node\node-v20.19.1-win-x64\node.exe"
$APP  = "c:\Rupesh\Lead_extracter\lead-automation\index.js"
$DIR  = "c:\Rupesh\Lead_extracter\lead-automation"

# ── Configure: How many instances to start ──────────────────
# Change this number (1–10) — each gets its own port
$INSTANCES = 5   # <-- change to 10 for max

# ── Kill any existing node processes first ──────────────────
Write-Host "`n🔄 Stopping existing instances..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "🚀 Starting $INSTANCES CRM instances..." -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor DarkGray

# ── Start each instance on a different port ──────────────────
for ($i = 0; $i -lt $INSTANCES; $i++) {
    $port = 3000 + $i
    
    # Set NO_BROWSER for all except first instance
    $noBrowser = if ($i -eq 0) { "" } else { "NO_BROWSER=1" }
    
    $title = "CRM Instance $($i+1) - Port $port"
    
    # Launch in new window with port-specific title
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "`$env:PORT='$port'; `$env:NO_BROWSER='$noBrowser'; Set-Location '$DIR'; Write-Host '=== CRM Instance $($i+1) - Port $port ===' -ForegroundColor Cyan; & '$NODE' '$APP'"
    ) -WindowStyle Normal
    
    Write-Host "  ✅ Instance $($i+1) started on http://localhost:$port" -ForegroundColor Green
    Start-Sleep -Milliseconds 800  # stagger startup to avoid DB conflicts
}

Write-Host "`n" + "=" * 50 -ForegroundColor DarkGray
Write-Host "✅ All $INSTANCES instances running!" -ForegroundColor Green
Write-Host "`n📋 Your dashboards:" -ForegroundColor Cyan
for ($i = 0; $i -lt $INSTANCES; $i++) {
    $port = 3000 + $i
    Write-Host "   Instance $($i+1): http://localhost:$port" -ForegroundColor White
}

Write-Host "`n🎯 Opening Control Panel..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Open the multi-instance control panel
Start-Process "http://localhost:3000/multi-control.html"

Write-Host "`nPress any key to stop all instances..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Cleanup
Write-Host "`n🛑 Stopping all instances..." -ForegroundColor Red
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "✅ All stopped." -ForegroundColor Green
