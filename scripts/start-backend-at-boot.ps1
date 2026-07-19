# Start attendance-api at Windows boot (no user login required).
# Invoked by the "Attendance API Boot" scheduled task.

$ErrorActionPreference = "Stop"

$ProdRepo = "D:\Calvin\web-based-attendance"
$RepoRoot = if (Test-Path $ProdRepo) { $ProdRepo } else { (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
$StartScript = Join-Path $RepoRoot "scripts\start-api-at-boot.ps1"
$Pm2Home = "C:\Users\calvin\.pm2"
$LogDir = Join-Path $Pm2Home "logs"
$LogFile = Join-Path $LogDir "boot-start.log"
$LockFile = Join-Path $LogDir "api-boot.lock"

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

function Test-OutLogShowsQuota {
    $outLog = Join-Path $RepoRoot "logs\api-out.log"
    if (-not (Test-Path $outLog)) { return $false }
    $tail = Get-Content $outLog -Tail 40 -ErrorAction SilentlyContinue | Out-String
    return ($tail -match 'quota|compute time')
}

function Enter-BootLock {
    # ponytail: overlapping boot + tunnel "kick API" races. Ceiling: stale lock after 45 min.
    if (Test-Path $LockFile) {
        $ageMin = ((Get-Date) - (Get-Item $LockFile).LastWriteTime).TotalMinutes
        if ($ageMin -lt 45) {
            Write-BootLog "Another API boot holds the lock ($([int]$ageMin)m old); exiting."
            exit 0
        }
        Write-BootLog "Stale API boot lock ($([int]$ageMin)m); taking over."
        Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
    }
    Set-Content -Path $LockFile -Value $PID -Encoding ASCII
}

function Exit-BootLock {
    if ((Test-Path $LockFile) -and ((Get-Content $LockFile -Raw).Trim() -eq [string]$PID)) {
        Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
    }
}

try {
    Write-BootLog "Boot start (repo=$RepoRoot)."

    if (-not (Test-Path $StartScript)) {
        throw "Missing start script: $StartScript"
    }

    Enter-BootLock

    # Wait for network/DNS after reboot before hitting Neon.
    Write-BootLog "Waiting 90s for network..."
    Start-Sleep -Seconds 90

    if (Test-ApiHealthy) {
        Write-BootLog "API already healthy; skipping start."
        exit 0
    }

    # More cycles: Neon free-tier quota often clears within ~30–60 minutes after reboot.
    $maxCycles = 8

    for ($cycle = 1; $cycle -le $maxCycles; $cycle++) {
        Write-BootLog "Start attempt $cycle/$maxCycles..."

        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StartScript -RepoRoot $RepoRoot
        if ($LASTEXITCODE -eq 0 -and (Test-ApiHealthy)) {
            Write-BootLog "API started successfully."
            exit 0
        }

        if ($cycle -lt $maxCycles) {
            $pause = if (Test-OutLogShowsQuota) { 180 } else { 60 }
            Write-BootLog "Attempt $cycle failed; retrying in ${pause}s..."
            Start-Sleep -Seconds $pause
        }
    }

    throw "Health check failed after $maxCycles start attempts."
} catch {
    Write-BootLog "ERROR: $($_.Exception.Message)"
    exit 1
} finally {
    Exit-BootLock
}
