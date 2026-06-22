# Quick manual test — uses production repo path when present.
$ProdRepo = "D:\Calvin\web-based-attendance"
$RepoRoot = if (Test-Path $ProdRepo) { $ProdRepo } else { (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
$ScriptDir = if (Test-Path $ProdRepo) {
    Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "scripts"
} else {
    $PSScriptRoot
}
Write-Host "Repo: $RepoRoot"
Write-Host "Logs: $(Join-Path $RepoRoot 'logs\backup-boot.log')"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "install-pg17-client.ps1") -RepoRoot $RepoRoot
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $ScriptDir "backup-database.ps1") -RepoRoot $RepoRoot
Write-Host "Exit: $LASTEXITCODE"
if (Test-Path (Join-Path $RepoRoot "logs\backup-last.err")) {
    Write-Host "--- pg_dump stderr ---"
    Get-Content (Join-Path $RepoRoot "logs\backup-last.err") -Tail 5
}
Get-Content (Join-Path $RepoRoot "logs\backup.log") -Tail 5
