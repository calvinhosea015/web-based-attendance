# Register a SYSTEM scheduled task that restarts the API only when it stops answering
# health checks. It runs every few minutes; api-watchdog no-ops while healthy, so the
# interval itself caps restarts (one attempt per interval) and a crash loop can never
# hammer the box. Run this in an Administrator PowerShell.

param(
    [string]$RepoRoot = "D:\Calvin\web-based-attendance",
    [int]$IntervalMinutes = 3
)

$ErrorActionPreference = "Stop"
$TaskName = "Attendance API Watchdog"

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $IsAdmin) { throw "Run PowerShell as Administrator to install the watchdog task." }

$Watchdog = Join-Path $RepoRoot "scripts\api-watchdog.ps1"
$Ensure = Join-Path $RepoRoot "scripts\ensure-stack.ps1"
if (-not (Test-Path $Watchdog)) { throw "Missing watchdog script: $Watchdog" }
if (-not (Test-Path $Ensure)) { throw "Missing ensure-stack script: $Ensure" }

# Sanity: fail fast if the watchdog's own logic is broken before we schedule it.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Watchdog -SelfTest
if ($LASTEXITCODE -ne 0) { throw "api-watchdog self-test failed; not installing." }

# Sync from the calling repo when installing from a non-production checkout.
$CallerRepo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ($CallerRepo -ne $RepoRoot) {
    foreach ($f in @("api-watchdog.ps1", "ensure-stack.ps1", "restart-api.ps1", "start-api-at-boot.ps1", "start-frontend-at-boot.ps1", "start-tunnel-at-boot.ps1", "sync-vercel-at-boot.ps1", "sync-vercel-api-url.ps1")) {
        $src = Join-Path $CallerRepo "scripts\$f"
        if (Test-Path $src) { Copy-Item $src (Join-Path $RepoRoot "scripts\$f") -Force }
    }
}

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Watchdog`" -RepoRoot `"$RepoRoot`""

# Repetition triggers are awkward in PowerShell: build a -Once trigger, then graft on a
# repetition block (every N minutes, effectively forever).
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date)
$Trigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
        -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) `
        -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Force | Out-Null

Write-Host "Installed '$TaskName' (every $IntervalMinutes min; restores API + frontend + tunnel + Vercel sync when down)."
Write-Host "Run it now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Log: C:\Users\calvin\.pm2\logs\stack-ensure.log"
