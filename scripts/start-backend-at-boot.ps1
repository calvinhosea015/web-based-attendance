# Start attendance-api at Windows boot (no user login required).
# Invoked by the "Attendance API Boot" scheduled task.

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Backend = Join-Path $RepoRoot "backend"
$NodeDir = Join-Path (Split-Path $RepoRoot -Parent) "node"
$Pm2Home = "C:\Users\calvin\.pm2"
$LogDir = Join-Path $Pm2Home "logs"
$LogFile = Join-Path $LogDir "boot-start.log"

if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
    $NodeDir = "D:\Calvin\node"
    $Backend = "D:\Calvin\web-based-attendance\backend"
}

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

function Write-BootLog([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $LogFile -Value $line
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

try {
    Write-BootLog "Boot start (repo=$RepoRoot, node=$NodeDir)."

    if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
        throw "Node.js not found at $NodeDir"
    }

    $env:Path = "$NodeDir;$env:Path"
    $env:PM2_HOME = $Pm2Home

    # Wait for disk and network after reboot (Neon DB, DNS).
    Start-Sleep -Seconds 30

    if (Test-ApiHealthy) {
        Write-BootLog "API already healthy; skipping start."
        exit 0
    }

    Write-BootLog "API not yet up; starting attendance-api..."

    if (-not (Test-Path (Join-Path $Backend ".env"))) {
        throw "Missing backend/.env at $Backend"
    }

    Set-Location $Backend
    $Pm2Bin = Join-Path $NodeDir "node_modules\pm2\bin\pm2"
    if (-not (Test-Path $Pm2Bin)) {
        throw "PM2 not found at $Pm2Bin (run: npm install -g pm2 in $NodeDir)"
    }
    $NodeExe = Join-Path $NodeDir "node.exe"

    # Do not use "pm2 resurrect" on Windows — dump.pm2 env keys break JSON parsing.
    & $NodeExe $Pm2Bin delete attendance-api 2>$null
    & $NodeExe $Pm2Bin start server.js --name attendance-api --cwd $Backend --interpreter $NodeExe
    & $NodeExe $Pm2Bin save

    if (Wait-ApiHealthy -MaxAttempts 12 -SecondsBetween 10) {
        Write-BootLog "API started successfully."
        exit 0
    }

    throw "Health check failed after starting attendance-api."
} catch {
    Write-BootLog "ERROR: $($_.Exception.Message)"
    exit 1
}
