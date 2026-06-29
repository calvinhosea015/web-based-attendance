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
if (-not (Test-Path $Watchdog)) { throw "Missing watchdog script: $Watchdog" }

# Sanity: fail fast if the watchdog's own logic is broken before we schedule it.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Watchdog -SelfTest
if ($LASTEXITCODE -ne 0) { throw "api-watchdog self-test failed; not installing." }

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
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Force | Out-Null

Write-Host "Installed '$TaskName' (checks every $IntervalMinutes min; restarts API only when unhealthy)."
Write-Host "Run it now: Start-ScheduledTask -TaskName '$TaskName'"
