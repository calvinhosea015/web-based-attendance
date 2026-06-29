# Restart the attendance API only when it stops answering health checks.
# Safe to run on a timer: it is a no-op while the API is healthy, so a crash-looping
# app can be restarted at most once per timer interval (the interval is the rate limit).
# Runs as SYSTEM via the "Attendance API Watchdog" scheduled task.

param(
    [string]$RepoRoot = "D:\Calvin\web-based-attendance",
    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

# Pure predicate so the restart decision can be checked without a live server.
function Test-HealthOk {
    param([int]$StatusCode, [string]$Content)
    return ($StatusCode -eq 200 -and $Content -match '"ok"\s*:\s*true')
}

if ($SelfTest) {
    if (-not (Test-HealthOk 200 '{"ok":true}')) { throw "SelfTest failed: healthy body was rejected" }
    if (Test-HealthOk 200 '{"ok":false}') { throw "SelfTest failed: unhealthy body was accepted" }
    if (Test-HealthOk 503 '{"ok":true}') { throw "SelfTest failed: non-200 status was accepted" }
    Write-Host "api-watchdog self-test passed."
    exit 0
}

function Test-ApiHealthy {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:5001/health/ready" -UseBasicParsing -TimeoutSec 10
        return (Test-HealthOk $r.StatusCode $r.Content)
    } catch {
        return $false
    }
}

if (Test-ApiHealthy) { exit 0 }

# Unhealthy: hand off to restart-api (frees port 5001, then starts a fresh node).
# -NoElevate because the watchdog task already runs as SYSTEM and can kill SYSTEM node.
& (Join-Path $PSScriptRoot "restart-api.ps1") -RepoRoot $RepoRoot -NoElevate
