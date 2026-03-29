# TeslaPulse: Refresh Tesla token locally and push to production
# Schedule via Windows Task Scheduler every 6 hours
#
# Setup (one-time):
#   1. Create C:\Users\<you>\.teslapulse-local-pw  (your local TeslaPulse password, plain text)
#   2. Create C:\Users\<you>\.teslapulse-prod-pw   (your production TeslaPulse password, plain text)
#   3. Create a Task Scheduler task:
#      - Trigger: every 6 hours
#      - Action: powershell.exe -ExecutionPolicy Bypass -File C:\WEB\teslapulse\scripts\refresh-and-push.ps1
#      - "Run whether user is logged on or not" = NO (needs localhost access)

$ErrorActionPreference = "Stop"
$LOCAL = "http://localhost:3000"
$LOG = "$env:USERPROFILE\.teslapulse-refresh.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Write-Host $line
    Add-Content -Path $LOG -Value $line
}

Log "=== Token refresh started ==="

# Read passwords
$localPwFile = "$env:USERPROFILE\.teslapulse-local-pw"
$prodPwFile = "$env:USERPROFILE\.teslapulse-prod-pw"

if (-not (Test-Path $localPwFile)) { Log "ERROR: Create $localPwFile"; exit 1 }
if (-not (Test-Path $prodPwFile)) { Log "ERROR: Create $prodPwFile"; exit 1 }

$localPw = (Get-Content $localPwFile -Raw).Trim()
$prodPw = (Get-Content $prodPwFile -Raw).Trim()

# Check if local server is running
$serverRunning = $true
try { $null = Invoke-RestMethod "$LOCAL/api/auth/status" -TimeoutSec 3 } catch { $serverRunning = $false }

$startedServer = $false
if (-not $serverRunning) {
    Log "Starting dev server..."
    $proc = Start-Process -FilePath "npx" -ArgumentList "next dev -p 3000" -WorkingDirectory "C:\WEB\teslapulse" -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 10
    $startedServer = $true
}

try {
    # Login locally
    Log "Logging in locally..."
    $session = Invoke-WebRequest "$LOCAL/api/auth/login" -Method POST `
        -ContentType "application/json" `
        -Body (@{password=$localPw} | ConvertTo-Json) `
        -SessionVariable ws

    # Trigger token refresh by hitting an authenticated Tesla endpoint
    Log "Refreshing token..."
    try {
        $null = Invoke-RestMethod "$LOCAL/api/debug/tesla-raw" -WebSession $ws -TimeoutSec 30
        Log "Token refreshed successfully"
    } catch {
        Log "Refresh call returned error (may still have refreshed): $_"
    }

    # Check token status
    $status = Invoke-RestMethod "$LOCAL/api/tesla/sync-token" -WebSession $ws
    Log "Token status: has_access=$($status.has_access_token), expires=$([DateTimeOffset]::FromUnixTimeMilliseconds($status.expires_at).LocalDateTime)"

    # Push to production
    Log "Pushing to production..."
    $push = Invoke-RestMethod "$LOCAL/api/tesla/push-tokens" -Method POST `
        -ContentType "application/json" `
        -Body (@{password=$prodPw} | ConvertTo-Json) `
        -WebSession $ws
    Log "Push result: $($push | ConvertTo-Json -Compress)"

} finally {
    if ($startedServer -and $proc) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Log "Stopped dev server"
    }
}

Log "=== Done ==="
