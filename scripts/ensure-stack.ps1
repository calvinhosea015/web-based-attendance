# Bring the full local stack up when any piece is missing.
# Safe to run on a timer (Attendance API Watchdog): no-op while healthy.
#
# Order: API (:5001) -> frontend Vite (:3000) -> Cloudflare tunnel -> Vercel VITE_API_BASE sync.
# Does not require a reboot; used after Neon quota clears mid-morning.

param(
    [string]$RepoRoot = "D:\Calvin\web-based-attendance",
    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"

function Test-HealthOk {
    param([int]$StatusCode, [string]$Content)
    return ($StatusCode -eq 200 -and $Content -match '"ok"\s*:\s*true')
}

if ($SelfTest) {
    if (-not (Test-HealthOk 200 '{"ok":true,"db":true}')) { throw "SelfTest: healthy rejected" }
    if (Test-HealthOk 503 '{"ok":false}') { throw "SelfTest: unhealthy accepted" }
    Write-Host "ensure-stack self-test passed."
    exit 0
}

$Pm2Home = "C:\Users\calvin\.pm2"
$LogDir = Join-Path $Pm2Home "logs"
$LogFile = Join-Path $LogDir "stack-ensure.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-StackLog([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $LogFile -Value $line
}

function Test-ApiHealthy {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:5001/health/ready" -UseBasicParsing -TimeoutSec 10
        return (Test-HealthOk $r.StatusCode $r.Content)
    } catch {
        return $false
    }
}

function Test-FrontendUp {
    $listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if ($listening) { return $true }
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000/" -UseBasicParsing -TimeoutSec 5
        return ($resp.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Test-TunnelUp {
    $urlFile = "D:\Calvin\cloudflared\tunnel-url.txt"
    if (-not (Test-Path $urlFile)) { return $false }
    $base = (Get-Content $urlFile -Raw).Trim().TrimEnd('/')
    if (-not $base) { return $false }
    $cf = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue
    if (-not $cf) { return $false }
    try {
        $r = Invoke-WebRequest -Uri "$base/health" -UseBasicParsing -TimeoutSec 15
        return ($r.Content -match '"ok"\s*:\s*true')
    } catch {
        return $false
    }
}

function Test-ApiProcessRunning {
    $backendNorm = (Join-Path $RepoRoot "backend").ToLowerInvariant()
    $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine.ToLowerInvariant().Contains($backendNorm) -and
            $_.CommandLine -match 'server\.js'
        }
    return [bool]$procs
}

$Scripts = Join-Path $RepoRoot "scripts"

function Invoke-VercelSync {
    $syncBoot = Join-Path $Scripts "sync-vercel-at-boot.ps1"
    $vercelConfig = "D:\Calvin\cloudflared\vercel-sync.env"
    if (-not ((Test-Path $syncBoot) -and (Test-Path $vercelConfig))) {
        Write-StackLog "Vercel sync skipped (missing sync-vercel-at-boot.ps1 or vercel-sync.env)."
        return
    }
    Write-StackLog "Syncing VITE_API_BASE to Vercel..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncBoot
    if ($LASTEXITCODE -eq 0) {
        Write-StackLog "Vercel sync completed."
    } else {
        Write-StackLog "Vercel sync exited with code $LASTEXITCODE (see vercel-sync.log)."
    }
}

$changed = $false

if (-not (Test-ApiHealthy)) {
    if (Test-ApiProcessRunning) {
        Write-StackLog "API process running but not healthy yet (likely Neon migrate/quota); waiting for next tick."
        exit 0
    }
    Write-StackLog "API down; restarting (short wait; node keeps retrying Neon)."
    # Short wait so the watchdog task stays under its execution limit; migrateWithRetry keeps going.
    & (Join-Path $Scripts "restart-api.ps1") -RepoRoot $RepoRoot -NoElevate -MaxWaitSeconds 90
    $changed = $true
    if (-not (Test-ApiHealthy)) {
        if (Test-ApiProcessRunning) {
            Write-StackLog "API still warming up; will re-check next watchdog tick."
            exit 0
        }
        Write-StackLog "API still unhealthy after restart; will retry next watchdog tick."
        exit 1
    }
    Write-StackLog "API healthy."
}

if (-not (Test-FrontendUp)) {
    Write-StackLog "Frontend down; starting start-frontend-at-boot.ps1"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts "start-frontend-at-boot.ps1")
    $changed = $true
}

if (-not (Test-TunnelUp)) {
    Write-StackLog "Tunnel down; starting start-tunnel-at-boot.ps1"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Scripts "start-tunnel-at-boot.ps1")
    $changed = $true
}

# After any recovery that leaves the tunnel healthy, push the live API URL to Vercel.
# Tunnel boot also syncs on success; this covers API/FE recovery when the tunnel was
# already up, or a tunnel start that skipped sync on a partial failure.
if ($changed -and (Test-TunnelUp)) {
    Invoke-VercelSync
}

if (-not $changed) {
    exit 0
}

$api = Test-ApiHealthy
$fe = Test-FrontendUp
$tn = Test-TunnelUp
Write-StackLog "Stack check: api=$api frontend=$fe tunnel=$tn"
if (-not ($api -and $fe)) { exit 1 }
exit 0
