# One-shot installer: register every scheduled task the attendance stack needs to
# come back up automatically after a reboot (no user login required).
#
# Order matters at boot, so the installers set staggered start delays:
#   1. Attendance API Boot      - node server.js  -> :5001 (connects to remote Neon DB)
#   2. Attendance Frontend Boot - vite dev server -> :3000 (proxies /api to :5001)
#   3. Attendance Tunnel Boot   - cloudflared     -> public HTTPS URL for :5001
#   4. Attendance Vercel Sync   - pushes the live tunnel URL into Vercel VITE_API_BASE
#   5. Attendance API Watchdog  - every few minutes, ensure API + FE + tunnel + Vercel sync
#
# The database is remote managed Postgres (Neon) per backend/.env, so there is
# nothing local to start for it. Do NOT add a Docker Postgres boot task here.
#
# ponytail: quick Cloudflare tunnel = public URL changes every reboot. The Vercel
# sync task is what keeps the frontend pointed at the new URL. Upgrade path for a
# stable URL (and dropping the sync dependency): scripts/setup-named-tunnel.ps1.

$ErrorActionPreference = "Stop"

# Self-elevate: registering SYSTEM scheduled tasks requires Administrator.
$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $IsAdmin) {
    Write-Host "Requesting Administrator (approve the UAC prompt)..."
    Start-Process powershell.exe -Verb RunAs -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-File", "`"$PSCommandPath`""
    )
    exit 0
}

# Prefer the production checkout (what actually runs on this PC) so tasks point at
# the live copy; fall back to this repo on other machines.
$ProdRepo = "D:\Calvin\web-based-attendance"
$RepoRoot = if (Test-Path $ProdRepo) { $ProdRepo } else { (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
$ScriptDir = Join-Path $RepoRoot "scripts"
$SourceScripts = (Resolve-Path (Join-Path $PSScriptRoot ".")).Path

$LogDir = "C:\Users\calvin\.pm2\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir "install-all-boot-tasks.log"
function Log([string]$m) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

# Keep production scripts in sync with this checkout when they differ.
if ($SourceScripts -ne $ScriptDir -and (Test-Path $ProdRepo)) {
    New-Item -ItemType Directory -Force -Path $ScriptDir | Out-Null
    $toSync = @(
        "start-api-at-boot.ps1", "start-backend-at-boot.ps1", "restart-api.ps1",
        "start-frontend-at-boot.ps1", "start-tunnel-at-boot.ps1",
        "ensure-stack.ps1", "api-watchdog.ps1",
        "install-backend-boot-task.ps1", "install-frontend-boot-task.ps1",
        "install-tunnel-boot-task.ps1", "install-vercel-sync-boot-task.ps1",
        "install-api-watchdog-task.ps1", "sync-vercel-api-url.ps1", "sync-vercel-at-boot.ps1"
    )
    foreach ($f in $toSync) {
        $src = Join-Path $SourceScripts $f
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $ScriptDir $f) -Force
        }
    }
    # Also sync the Neon retry helper used at API boot.
    $backendSrc = Join-Path (Split-Path $SourceScripts -Parent) "backend\src"
    $backendDst = Join-Path $ProdRepo "backend\src"
    foreach ($rel in @("server.js", "utils\dbConnectRetry.js")) {
        $s = Join-Path $backendSrc $rel
        $d = Join-Path $backendDst $rel
        if (Test-Path $s) {
            New-Item -ItemType Directory -Force -Path (Split-Path $d -Parent) | Out-Null
            Copy-Item $s $d -Force
        }
    }
    Log "Synced boot scripts + Neon retry code to $ProdRepo"
}

Log "Installing boot tasks from $ScriptDir"

# (installer file, friendly name) in boot order.
$installers = @(
    @{ File = "install-backend-boot-task.ps1";     Name = "Attendance API Boot" },
    @{ File = "install-frontend-boot-task.ps1";     Name = "Attendance Frontend Boot" },
    @{ File = "install-tunnel-boot-task.ps1";       Name = "Attendance Tunnel Boot" },
    @{ File = "install-vercel-sync-boot-task.ps1";  Name = "Attendance Vercel Sync" },
    @{ File = "install-api-watchdog-task.ps1";      Name = "Attendance API Watchdog" }
)

$failed = @()
foreach ($i in $installers) {
    $path = Join-Path $ScriptDir $i.File
    if (-not (Test-Path $path)) {
        Log "SKIP $($i.Name): missing $path"
        $failed += $i.Name
        continue
    }
    Log "--> $($i.Name) ($($i.File))"
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $path
        if ($LASTEXITCODE -ne 0) { throw "installer exited with code $LASTEXITCODE" }
        Log "    OK"
    } catch {
        Log "    FAILED: $($_.Exception.Message)"
        $failed += $i.Name
    }
}

Log "----- Registered attendance tasks -----"
Get-ScheduledTask | Where-Object { $_.TaskName -like "Attendance*" } |
    ForEach-Object { Log ("  {0,-26} {1}" -f $_.TaskName, $_.State) }

if ($failed.Count -gt 0) {
    Log "DONE WITH ERRORS. Failed: $($failed -join ', ')"
} else {
    Log "DONE. All boot tasks installed."
    Log "Verify after reboot (or test now): Start-ScheduledTask -TaskName 'Attendance API Boot'"
    Log "Watchdog: Start-ScheduledTask -TaskName 'Attendance API Watchdog'"
}
