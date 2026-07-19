# Stop the API on port 5001 and start it again.
# The boot task runs node as SYSTEM (often PID 8); killing it requires Administrator.

param(
    [string]$RepoRoot = (Join-Path $PSScriptRoot ".."),
    [switch]$NoElevate,
    [int]$MaxWaitSeconds = 2400
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
$StartScript = Join-Path $PSScriptRoot "start-api-at-boot.ps1"
$BootLog = Join-Path $RepoRoot "logs\api-boot.log"

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-BootLog {
    param([string]$Message)
    $line = "$(Get-Date -Format o) $Message"
    $logDir = Split-Path $BootLog -Parent
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -Path $BootLog -Value $line
}

function Get-Port5001Pids {
    $connections = Get-NetTCPConnection -LocalPort 5001 -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) { return @() }
    return @($connections | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 })
}

function Stop-Port5001Listeners {
    param([int[]]$Pids)
    foreach ($procId in $Pids) {
        $null = cmd /c "taskkill /F /PID $procId 2>&1"
    }
    if ($Pids.Count -gt 0) {
        Start-Sleep -Seconds 2
    }
}

$pids = Get-Port5001Pids
if ($pids.Count -gt 0) {
    Stop-Port5001Listeners -Pids $pids
    $stillListening = Get-Port5001Pids
    if ($stillListening.Count -gt 0 -and -not (Test-IsAdmin) -and -not $NoElevate) {
        Write-BootLog "restart-api: port 5001 still held by pid(s) $($stillListening -join ', '); re-launching elevated."
        Write-Host "Port 5001 is held by a SYSTEM process. Re-launching as Administrator (UAC prompt)..."
        $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -RepoRoot `"$RepoRoot`" -NoElevate"
        Start-Process powershell.exe -Verb RunAs -ArgumentList $argList -Wait
        exit $LASTEXITCODE
    }
    if ($stillListening.Count -gt 0) {
        throw "Could not free port 5001 (pid(s): $($stillListening -join ', ')). Run this script as Administrator."
    }
    Write-BootLog "restart-api: stopped pid(s) $($pids -join ', ')."
}

& $StartScript -RepoRoot $RepoRoot -MaxWaitSeconds $MaxWaitSeconds
