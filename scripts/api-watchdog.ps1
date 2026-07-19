# Restart missing stack pieces when health checks fail.
# Safe on a timer: no-op while API + frontend (+ tunnel when configured) are up.
# Runs as SYSTEM via the "Attendance API Watchdog" scheduled task.

param(
    [string]$RepoRoot = "D:\Calvin\web-based-attendance",
    [switch]$SelfTest
)

$ErrorActionPreference = "Stop"
$Ensure = Join-Path $PSScriptRoot "ensure-stack.ps1"

if ($SelfTest) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Ensure -SelfTest
    if ($LASTEXITCODE -ne 0) { throw "ensure-stack self-test failed" }
    Write-Host "api-watchdog self-test passed."
    exit 0
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Ensure -RepoRoot $RepoRoot
exit $LASTEXITCODE
