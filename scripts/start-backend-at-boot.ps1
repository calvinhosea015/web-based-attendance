# Start attendance-api at Windows boot (no user login required).
# Invoked by the "Attendance API Boot" scheduled task.
#
# Runs node server.js directly (not PM2) so SYSTEM boot does not grab the global
# PM2 named pipe and block interactive pm2 commands for the calvin user.

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

function Stop-BackendServer([string]$BackendPath) {
    $backendNorm = $BackendPath.ToLowerInvariant()
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine.ToLowerInvariant().Contains($backendNorm) -and
            $_.CommandLine -match 'server\.js'
        } |
        ForEach-Object {
            Write-BootLog "Stopping stale server.js PID $($_.ProcessId)."
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

try {
    Write-BootLog "Boot start (repo=$RepoRoot, node=$NodeDir)."

    if (-not (Test-Path (Join-Path $NodeDir "node.exe"))) {
        throw "Node.js not found at $NodeDir"
    }

    $env:Path = "$NodeDir;$env:Path"

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

    $NodeExe = Join-Path $NodeDir "node.exe"
    Stop-BackendServer -BackendPath $Backend

    Start-Process -FilePath $NodeExe -ArgumentList "server.js" -WorkingDirectory $Backend -WindowStyle Hidden

    if (Wait-ApiHealthy -MaxAttempts 12 -SecondsBetween 10) {
        Write-BootLog "API started successfully."
        exit 0
    }

    throw "Health check failed after starting attendance-api."
} catch {
    Write-BootLog "ERROR: $($_.Exception.Message)"
    exit 1
}
