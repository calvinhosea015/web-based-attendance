# Fallback: sync VITE_API_BASE to Vercel after boot (even if tunnel boot had issues).
# Invoked by the "Attendance Vercel Sync" scheduled task (~5 min after startup).

$ErrorActionPreference = "Stop"

$SyncScript = Join-Path $PSScriptRoot "sync-vercel-api-url.ps1"
if (-not (Test-Path $SyncScript)) {
    $SyncScript = "D:\Calvin\web-based-attendance\scripts\sync-vercel-api-url.ps1"
}

if (-not (Test-Path $SyncScript)) {
    throw "Missing sync script: $SyncScript"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $SyncScript
exit $LASTEXITCODE
