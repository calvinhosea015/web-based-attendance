# Install scheduled task: database backup at system startup (+ daily 02:00 fallback).

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProdRepo = "D:\Calvin\web-based-attendance"
$TaskName = "Attendance DB Backup"

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $IsAdmin) {
    throw "Run PowerShell as Administrator to install the backup task."
}

if ((Test-Path $ProdRepo) -and ($RepoRoot -ne $ProdRepo)) {
    $prodScripts = Join-Path $ProdRepo "scripts"
    if (-not (Test-Path $prodScripts)) {
        New-Item -ItemType Directory -Force -Path $prodScripts | Out-Null
    }
    Copy-Item (Join-Path $RepoRoot "scripts\backup-database.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\start-backup-at-boot.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-pg17-client.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-backup-task.ps1") $prodScripts -Force
    Write-Host "Synced backup scripts to $prodScripts"
}

$BootScript = if (Test-Path (Join-Path $ProdRepo "scripts\start-backup-at-boot.ps1")) {
    Join-Path $ProdRepo "scripts\start-backup-at-boot.ps1"
} else {
    Join-Path $RepoRoot "scripts\start-backup-at-boot.ps1"
}

$Backend = if (Test-Path (Join-Path $ProdRepo "backend")) {
    Join-Path $ProdRepo "backend"
} else {
    Join-Path $RepoRoot "backend"
}

$EnvFile = Join-Path $Backend ".env"
if (Test-Path $EnvFile) {
    icacls $EnvFile /grant "SYSTEM:R" /Q | Out-Null
}

$BackupDir = if (Test-Path (Join-Path $ProdRepo "backups")) {
    Join-Path $ProdRepo "backups"
} else {
    Join-Path $RepoRoot "backups"
}
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
icacls $BackupDir /grant "SYSTEM:(OI)(CI)M" /T /Q | Out-Null

$LogRoot = if (Test-Path $ProdRepo) { $ProdRepo } else { $RepoRoot }
$LogDir = Join-Path $LogRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $LogDir /grant "SYSTEM:(OI)(CI)M" /T /Q 2>$null | Out-Null
icacls $LogDir /grant "${currentUser}:(OI)(CI)M" /T /Q 2>$null | Out-Null

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$BootScript`""

$TriggerBoot = New-ScheduledTaskTrigger -AtStartup
$TriggerBoot.Delay = "PT8M"

$TriggerDaily = New-ScheduledTaskTrigger -Daily -At "02:00"

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5)

$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger @($TriggerBoot, $TriggerDaily) `
    -Settings $Settings `
    -Principal $Principal `
    -Force | Out-Null

Write-Host "Installed scheduled task '$TaskName'."
Write-Host "  - At system startup (~8 min after boot, no login required)"
Write-Host "  - Daily at 02:00 (fallback when PC stays on)"
Write-Host "Boot script: $BootScript"
Write-Host "Backup log: $(Join-Path $LogRoot 'logs\backup.log')"
Write-Host "Boot log:   $(Join-Path $LogRoot 'logs\backup-boot.log')"
Write-Host ""
Write-Host "Test without rebooting:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Get-Content $(Join-Path $LogRoot 'logs\backup-boot.log') -Tail 10"
