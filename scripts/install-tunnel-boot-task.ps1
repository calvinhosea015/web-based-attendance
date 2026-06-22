
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProdRepo = "D:\Calvin\web-based-attendance"
$TaskName = "Attendance Tunnel Boot"

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
    Copy-Item (Join-Path $RepoRoot "scripts\start-tunnel-at-boot.ps1") $prodScripts -Force
    Copy-Item (Join-Path $RepoRoot "scripts\install-tunnel-boot-task.ps1") $prodScripts -Force
    Write-Host "Synced tunnel boot scripts to $prodScripts"
}

if (Test-Path (Join-Path $ProdRepo "scripts\start-tunnel-at-boot.ps1")) {
    $BootScript = Join-Path $ProdRepo "scripts\start-tunnel-at-boot.ps1"
} else {
    $BootScript = Join-Path $RepoRoot "scripts\start-tunnel-at-boot.ps1"
}

if (-not (Test-Path $BootScript)) {
    throw "Missing boot script: $BootScript"
}

if (-not (Test-Path "D:\Calvin\cloudflared\cloudflared.exe")) {
    throw "Install cloudflared at D:\Calvin\cloudflared\cloudflared.exe first."
}

$Pm2Home = "C:\Users\calvin\.pm2"
if (Test-Path $Pm2Home) {
    icacls $Pm2Home /grant "SYSTEM:(OI)(CI)F" /T /Q | Out-Null
}
icacls "D:\Calvin\cloudflared" /grant "SYSTEM:(OI)(CI)RX" /T /Q | Out-Null

$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$BootScript`""

$Trigger = New-ScheduledTaskTrigger -AtStartup
# Start after API boot: 60s task delay + 90s network wait + up to ~4 min API start.
$Trigger.Delay = "PT330S"

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
Write-Host "Boot log: C:\Users\calvin\.pm2\logs\boot-tunnel.log"
Write-Host "Tunnel URL file: D:\Calvin\cloudflared\tunnel-url.txt"
Write-Host ""
Write-Host "For a STABLE hostname (recommended), run once:"
Write-Host "  .\scripts\setup-named-tunnel.ps1 -Hostname api.yourdomain.com"
Write-Host "Requires a domain on Cloudflare (free plan). Quick tunnels change URL every restart."
Write-Host ""
Write-Host "Test without rebooting:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
