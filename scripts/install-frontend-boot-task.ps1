
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProdRepo = "D:\Calvin\web-based-attendance"
$TaskName = "Attendance Frontend Boot"

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $IsAdmin) {
    throw "Run PowerShell as Administrator to install the boot task."
}

# Keep production copy in sync when the server uses D:\Calvin.
if ((Test-Path $ProdRepo) -and ($RepoRoot -ne $ProdRepo)) {
    $prodScripts = Join-Path $ProdRepo "scripts"
    if (-not (Test-Path $prodScripts)) {
        New-Item -ItemType Directory -Force -Path $prodScripts | Out-Null
    }
    Copy-Item (Join-Path $RepoRoot "scripts\start-frontend-at-boot.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-frontend-boot-task.ps1") $prodScripts -Force
    Write-Host "Synced frontend boot scripts to $prodScripts"
}

if (Test-Path (Join-Path $ProdRepo "scripts\start-frontend-at-boot.ps1")) {
    $BootScript = Join-Path $ProdRepo "scripts\start-frontend-at-boot.ps1"
    $Frontend = Join-Path $ProdRepo "frontend"
} else {
    $BootScript = Join-Path $RepoRoot "scripts\start-frontend-at-boot.ps1"
    $Frontend = Join-Path $RepoRoot "frontend"
}

if (-not (Test-Path $BootScript)) {
    throw "Missing boot script: $BootScript"
}

$Pm2Home = "C:\Users\calvin\.pm2"
if (Test-Path $Pm2Home) {
    icacls $Pm2Home /grant "SYSTEM:(OI)(CI)F" /T /Q | Out-Null
}

icacls $Frontend /grant "SYSTEM:(OI)(CI)RX" /T /Q | Out-Null

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$BootScript`""

$Trigger = New-ScheduledTaskTrigger -AtStartup
# Start after the API boot task (60s trigger + ~30–90s API startup).
$Trigger.Delay = "PT120S"

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 5 `
    -RestartInterval (New-TimeSpan -Minutes 2)

$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Force | Out-Null

Write-Host "Installed scheduled task '$TaskName' (runs at system startup, no login required)."
Write-Host "Boot script: $BootScript"
Write-Host "Boot log: C:\Users\calvin\.pm2\logs\boot-frontend.log"
Write-Host "Dev UI: http://localhost:3000 (proxies /api to port 5001)"
Write-Host ""
Write-Host "Prerequisite: cd frontend && npm install (once, so node_modules/vite exists)."
Write-Host ""
Write-Host "Test without rebooting:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Get-Content C:\Users\calvin\.pm2\logs\boot-frontend.log -Tail 20"
