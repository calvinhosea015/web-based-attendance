
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProdRepo = "D:\Calvin\web-based-attendance"
$TaskName = "Attendance Vercel Sync"

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $IsAdmin) {
    throw "Run PowerShell as Administrator to install the boot task."
}

if ((Test-Path $ProdRepo) -and ($RepoRoot -ne $ProdRepo)) {
    $prodScripts = Join-Path $ProdRepo "scripts"
    if (-not (Test-Path $prodScripts)) {
        New-Item -ItemType Directory -Force -Path $prodScripts | Out-Null
    }
    Copy-Item (Join-Path $RepoRoot "scripts\sync-vercel-at-boot.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\sync-vercel-api-url.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-vercel-sync-boot-task.ps1") $prodScripts -Force
    Write-Host "Synced Vercel sync scripts to $prodScripts"
}

if (Test-Path (Join-Path $ProdRepo "scripts\sync-vercel-at-boot.ps1")) {
    $BootScript = Join-Path $ProdRepo "scripts\sync-vercel-at-boot.ps1"
} else {
    $BootScript = Join-Path $RepoRoot "scripts\sync-vercel-at-boot.ps1"
}

if (-not (Test-Path $BootScript)) {
    throw "Missing boot script: $BootScript"
}

if (-not (Test-Path "D:\Calvin\cloudflared\vercel-sync.env")) {
    throw "Create D:\Calvin\cloudflared\vercel-sync.env first (run install-vercel-sync.ps1)."
}

$Pm2Home = "C:\Users\calvin\.pm2"
if (Test-Path $Pm2Home) {
    icacls $Pm2Home /grant "SYSTEM:(OI)(CI)F" /T /Q | Out-Null
}
icacls "D:\Calvin\cloudflared" /grant "SYSTEM:(OI)(CI)F" /T /Q | Out-Null

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$BootScript`""

$Trigger = New-ScheduledTaskTrigger -AtStartup
# After tunnel boot (~2.5 min) + time for cloudflared to connect.
$Trigger.Delay = "PT300S"

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5)

$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Force | Out-Null

Write-Host "Installed scheduled task '$TaskName' (runs ~5 min after startup)."
Write-Host "Boot script: $BootScript"
Write-Host "Log: C:\Users\calvin\.pm2\logs\vercel-sync.log"
Write-Host ""
Write-Host "Test without rebooting:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
