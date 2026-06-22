# Start the attendance API if it is not already listening on port 5001.
# Used by the boot scheduled task and restart-api.ps1.

param(
    [string]$RepoRoot = (Join-Path $PSScriptRoot "..")
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

Write-BootLog "Starting API: $NodeExe server.js in $Backend"
Start-Process -FilePath $NodeExe -ArgumentList "server.js" `
    -WorkingDirectory $Backend `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog

# Migrations + Neon can take a few minutes right after reboot.
for ($i = 1; $i -le 48; $i++) {
    if (Test-ApiHealthy) {
        $listening = Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue
        $procId = if ($listening) { $listening.OwningProcess } else { "?" }
        Write-BootLog "API healthy on port 5001 (pid $procId) after ${i}x5s."
        exit 0
    }
    Start-Sleep -Seconds 5
}

Write-BootLog "ERROR: API did not become healthy within 4 minutes. See $OutLog and $ErrLog"
if (Test-Path $ErrLog) {
    Get-Content $ErrLog -Tail 15 | ForEach-Object { Write-BootLog "  err: $_" }
}
if (Test-Path $OutLog) {
    Get-Content $OutLog -Tail 10 | ForEach-Object { Write-BootLog "  out: $_" }
}
exit 1
