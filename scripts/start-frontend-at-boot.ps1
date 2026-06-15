# Start Vite dev server at Windows boot (no user login required).
# Invoked by the "Attendance Frontend Boot" scheduled task.
#
# Waits for the local API on port 5001, then runs vite directly via node
# (same approach as start-backend-at-boot.ps1 — no npm/PM2 for SYSTEM).

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Frontend = Join-Path $RepoRoot "frontend"
$NodeDir = Join-Path (Split-Path $RepoRoot -Parent) "node"
$Pm2Home = "C:\Users\calvin\.pm2"
$LogDir = Join-Path $Pm2Home "logs"
$LogFile = Join-Path $LogDir "boot-frontend.log"

if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
    $NodeDir = "D:\Calvin\node"
    $RepoRoot = "D:\Calvin\web-based-attendance"
    $Frontend = Join-Path $RepoRoot "frontend"
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

function Write-BootLog([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $LogFile -Value $line
}

function Test-FrontendUp {
    $listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if ($listening) { return $true }
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3000/" -UseBasicParsing -TimeoutSec 10
        return ($resp.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Wait-FrontendUp([int]$MaxAttempts, [int]$SecondsBetween) {
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        if (Test-FrontendUp) { return $true }
        if ($i -lt $MaxAttempts) {
            Start-Sleep -Seconds $SecondsBetween
        }
    }
    return $false
}

function Test-ApiHealthy {
    try {
        $health = Invoke-WebRequest -Uri "http://127.0.0.1:5001/health" -UseBasicParsing -TimeoutSec 10
        return ($health.Content -match '"ok"\s*:\s*true')
    } catch {
        return $false
    }
}

function Wait-ApiHealthy([int]$MaxAttempts, [int]$SecondsBetween) {
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        if (Test-ApiHealthy) { return $true }
        if ($i -lt $MaxAttempts) {
            Start-Sleep -Seconds $SecondsBetween
        }
    }
    return $false
}

function Stop-FrontendDevServer([string]$FrontendPath) {
    $frontendNorm = $FrontendPath.ToLowerInvariant()
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine.ToLowerInvariant().Contains($frontendNorm) -and
            ($_.CommandLine -match 'vite\.js' -or $_.CommandLine -match '\\vite\\')
        } |
        ForEach-Object {
            Write-BootLog "Stopping stale vite PID $($_.ProcessId)."
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

try {
    Write-BootLog "Boot start (repo=$RepoRoot, node=$NodeDir)."

    if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
        throw "Node.js not found at $NodeDir"
    }

    $env:Path = "$NodeDir;$env:Path"

    if (Test-FrontendUp) {
        Write-BootLog "Frontend already listening on port 3000; skipping start."
        exit 0
    }

    Write-BootLog "Waiting for API on port 5001..."
    if (-not (Wait-ApiHealthy -MaxAttempts 30 -SecondsBetween 10)) {
        throw "API not healthy on port 5001; cannot start frontend dev server."
    }

    $ViteBin = Join-Path $Frontend "node_modules\vite\bin\vite.js"
    if (-not (Test-Path $ViteBin)) {
        throw "Missing $ViteBin - run 'cd frontend && npm install' first."
    }

    Write-BootLog "Starting Vite dev server..."
    $NodeExe = Join-Path $NodeDir "node.exe"
    Stop-FrontendDevServer -FrontendPath $Frontend

    Start-Process -FilePath $NodeExe -ArgumentList $ViteBin -WorkingDirectory $Frontend -WindowStyle Hidden

    if (Wait-FrontendUp -MaxAttempts 12 -SecondsBetween 5) {
        Write-BootLog "Frontend started successfully on http://localhost:3000"
        exit 0
    }

    throw "Frontend did not bind to port 3000 after starting Vite."
} catch {
    Write-BootLog "ERROR: $($_.Exception.Message)"
    exit 1
}
