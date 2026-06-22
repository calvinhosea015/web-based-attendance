# Start attendance-api at Windows boot (no user login required).
# Invoked by the "Attendance API Boot" scheduled task.

$ErrorActionPreference = "Stop"

$ProdRepo = "D:\Calvin\web-based-attendance"
$RepoRoot = if (Test-Path $ProdRepo) { $ProdRepo } else { (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
$StartScript = Join-Path $RepoRoot "scripts\start-api-at-boot.ps1"
$Pm2Home = "C:\Users\calvin\.pm2"
$LogDir = Join-Path $Pm2Home "logs"
$LogFile = Join-Path $LogDir "boot-start.log"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

function Write-BootLog([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $LogFile -Value $line
}

function Test-ApiHealthy {
    try {
        $health = Invoke-WebRequest -Uri "http://127.0.0.1:5001/health/ready" -UseBasicParsing -TimeoutSec 10
        return ($health.StatusCode -eq 200 -and $health.Content -match '"ok"\s*:\s*true')
    } catch {
        return $false
    }
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
    Write-BootLog "Boot start (repo=$RepoRoot)."

    if (-not (Test-Path $StartScript)) {
        throw "Missing start script: $StartScript"
    }

    # Wait for network/DNS after reboot before hitting Neon.
    Write-BootLog "Waiting 90s for network..."
    Start-Sleep -Seconds 90

    if (Test-ApiHealthy) {
        Write-BootLog "API already healthy; skipping start."
        exit 0
    }

    $Backend = Join-Path $RepoRoot "backend"
    $maxCycles = 3

    for ($cycle = 1; $cycle -le $maxCycles; $cycle++) {
        Write-BootLog "Start attempt $cycle/$maxCycles..."
        Stop-BackendServer -BackendPath $Backend

        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StartScript -RepoRoot $RepoRoot
        if ($LASTEXITCODE -eq 0 -and (Test-ApiHealthy)) {
            Write-BootLog "API started successfully."
            exit 0
        }

        if ($cycle -lt $maxCycles) {
            Write-BootLog "Attempt $cycle failed; retrying in 60s..."
            Start-Sleep -Seconds 60
        }
    }

    throw "Health check failed after $maxCycles start attempts."
} catch {
    Write-BootLog "ERROR: $($_.Exception.Message)"
    exit 1
}
