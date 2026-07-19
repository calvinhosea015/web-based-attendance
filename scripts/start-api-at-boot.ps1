# Start the attendance API if it is not already listening on port 5001.
# Used by the boot scheduled task and restart-api.ps1.

param(
    [string]$RepoRoot = (Join-Path $PSScriptRoot ".."),
    # V8 heap cap (MB). A memory leak then crashes node cleanly instead of eating the
    # whole 32GB box; the watchdog restarts it. Bump if big Excel exports OOM.
    [int]$MaxOldSpaceMb = 2048,
    # Boot waits for Neon migrate retries (~40 min). Watchdog should pass a short value.
    [int]$MaxWaitSeconds = 2400
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
$Backend = Join-Path $RepoRoot "backend"
$LogDir = Join-Path $RepoRoot "logs"
$BootLog = Join-Path $LogDir "api-boot.log"
$OutLog = Join-Path $LogDir "api-out.log"
$ErrLog = Join-Path $LogDir "api-err.log"

$NodeExe = if (Test-Path "D:\Calvin\node\node.exe") {
    "D:\Calvin\node\node.exe"
} else {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { $cmd.Source } else { $null }
}

function Write-BootLog {
    param([string]$Message)
    $line = "$(Get-Date -Format o) $Message"
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Add-Content -Path $BootLog -Value $line
}

function Test-ApiHealthy {
    try {
        $health = Invoke-WebRequest -Uri "http://127.0.0.1:5001/health/ready" -UseBasicParsing -TimeoutSec 10
        return ($health.StatusCode -eq 200 -and $health.Content -match '"ok"\s*:\s*true')
    } catch {
        return $false
    }
}

function Stop-StaleApiProcesses {
    $backendNorm = $Backend.ToLowerInvariant()
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

    $pids = @(
        Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -gt 0 }
    )
    foreach ($procId in $pids) {
        Write-BootLog "Freeing port 5001 (PID $procId)."
        $null = cmd /c "taskkill /F /PID $procId 2>&1"
    }
    if ($pids.Count -gt 0) { Start-Sleep -Seconds 2 }
}

function Rotate-ApiLog([string]$Path) {
    if (-not (Test-Path $Path)) { return }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $dest = "$Path.$stamp.bak"
    try {
        Move-Item -Path $Path -Destination $dest -Force -ErrorAction Stop
    } catch {
        # Locked by a dying process: truncate so Start-Process can reopen.
        try { Set-Content -Path $Path -Value "" -Encoding UTF8 -ErrorAction Stop } catch { }
    }
}

if (-not $NodeExe) {
    Write-BootLog "ERROR: Node.js not found"
    exit 1
}

if (-not (Test-Path (Join-Path $Backend ".env"))) {
    Write-BootLog "ERROR: Missing $Backend\.env"
    exit 1
}

if (Test-ApiHealthy) {
    Write-BootLog "API already healthy on port 5001; skip start."
    exit 0
}

Stop-StaleApiProcesses
Rotate-ApiLog $OutLog
Rotate-ApiLog $ErrLog

# Neon migrateWithRetry can sit for ~40 minutes on quota; boot waits that long.
Write-BootLog "Starting API: $NodeExe --max-old-space-size=$MaxOldSpaceMb server.js in $Backend (wait up to ${MaxWaitSeconds}s)"
Start-Process -FilePath $NodeExe -ArgumentList "--max-old-space-size=$MaxOldSpaceMb", "server.js" `
    -WorkingDirectory $Backend `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog

$deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
$i = 0
while ((Get-Date) -lt $deadline) {
    $i++
    if (Test-ApiHealthy) {
        $listening = Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue
        $procId = if ($listening) { $listening.OwningProcess } else { "?" }
        Write-BootLog "API healthy on port 5001 (pid $procId) after ${i}x5s."
        exit 0
    }

    # Process exited early (non-retryable) — fail fast instead of waiting the full window.
    $stillRunning = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine.ToLowerInvariant().Contains($Backend.ToLowerInvariant()) -and
            $_.CommandLine -match 'server\.js'
        }
    if (-not $stillRunning -and $i -gt 6) {
        Write-BootLog "ERROR: API process exited before becoming healthy. See $OutLog and $ErrLog"
        if (Test-Path $ErrLog) {
            Get-Content $ErrLog -Tail 15 | ForEach-Object { Write-BootLog "  err: $_" }
        }
        if (Test-Path $OutLog) {
            Get-Content $OutLog -Tail 20 | ForEach-Object { Write-BootLog "  out: $_" }
        }
        exit 1
    }

    Start-Sleep -Seconds 5
}

Write-BootLog "ERROR: API did not become healthy within ${MaxWaitSeconds}s. See $OutLog and $ErrLog"
if (Test-Path $ErrLog) {
    Get-Content $ErrLog -Tail 15 | ForEach-Object { Write-BootLog "  err: $_" }
}
if (Test-Path $OutLog) {
    Get-Content $OutLog -Tail 10 | ForEach-Object { Write-BootLog "  out: $_" }
}
exit 1
