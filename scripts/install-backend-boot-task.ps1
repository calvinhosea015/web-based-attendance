

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProdRepo = "D:\Calvin\web-based-attendance"
$TaskName = "Attendance API Boot"

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
    Copy-Item (Join-Path $RepoRoot "scripts\start-backend-at-boot.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-backend-boot-task.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\start-frontend-at-boot.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-frontend-boot-task.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\start-tunnel-at-boot.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-tunnel-boot-task.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\setup-named-tunnel.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\sync-vercel-api-url.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-vercel-sync.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\sync-vercel-at-boot.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-vercel-sync-boot-task.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\backup-database.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\start-backup-at-boot.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-backup-task.ps1") $prodScripts -Force
    Write-Host "Synced boot scripts to $prodScripts"
}

if (Test-Path (Join-Path $ProdRepo "scripts\start-backend-at-boot.ps1")) {
    $BootScript = Join-Path $ProdRepo "scripts\start-backend-at-boot.ps1"
    $Backend = Join-Path $ProdRepo "backend"
} else {
    $BootScript = Join-Path $RepoRoot "scripts\start-backend-at-boot.ps1"
    $Backend = Join-Path $RepoRoot "backend"
}

if (-not (Test-Path $BootScript)) {
    throw "Missing boot script: $BootScript"
}

# Login-only PM2 startup causes duplicate/confusing behavior once boot task exists.
if (Get-Command pm2-startup -ErrorAction SilentlyContinue) {
    pm2-startup uninstall 2>$null
}

$Pm2Home = "C:\Users\calvin\.pm2"
if (Test-Path $Pm2Home) {
    icacls $Pm2Home /grant "SYSTEM:(OI)(CI)F" /T /Q | Out-Null
}

icacls $Backend /grant "SYSTEM:(OI)(CI)RX" /T /Q | Out-Null
$EnvFile = Join-Path $Backend ".env"
if (Test-Path $EnvFile) {
    icacls $EnvFile /grant "SYSTEM:R" /Q | Out-Null
}

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$BootScript`""

$Trigger = New-ScheduledTaskTrigger -AtStartup
$Trigger.Delay = "PT60S"

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
Write-Host "Boot log: C:\Users\calvin\.pm2\logs\boot-start.log"
Write-Host ""
Write-Host "Test without rebooting:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
