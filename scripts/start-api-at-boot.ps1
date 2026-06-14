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

if (-not $NodeExe) {
    Write-BootLog "ERROR: Node.js not found"
    exit 1
}

if (-not (Test-Path (Join-Path $Backend ".env"))) {
    Write-BootLog "ERROR: Missing $Backend\.env"
    exit 1
}

$listening = Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    Write-BootLog "Port 5001 already in use (pid $($listening.OwningProcess)); skip start."
    exit 0
}

Write-BootLog "Starting API: $NodeExe server.js in $Backend"
Start-Process -FilePath $NodeExe -ArgumentList "server.js" `
    -WorkingDirectory $Backend `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog

Start-Sleep -Seconds 3
$listening = Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    Write-BootLog "API started (pid $($listening.OwningProcess))."
    exit 0
}

Write-BootLog "ERROR: API did not bind to port 5001. See $ErrLog"
exit 1
