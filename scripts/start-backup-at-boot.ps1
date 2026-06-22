# Run database backup after Windows boot (no user login required).
# Invoked by the "Attendance DB Backup" scheduled task.

$ErrorActionPreference = "Stop"

$ProdRepo = "D:\Calvin\web-based-attendance"
$RepoRoot = if (Test-Path $ProdRepo) { $ProdRepo } else { (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
$BackupScript = Join-Path $RepoRoot "scripts\backup-database.ps1"
$LogDir = Join-Path $RepoRoot "logs"
$BootLog = Join-Path $LogDir "backup-boot.log"

function Write-BootLog([string]$Message) {
    $line = "$(Get-Date -Format o) $Message"
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    Add-Content -Path $BootLog -Value $line
}

function Test-NetworkUp {
    try {
        $null = Resolve-DnsName -Name "dns.google" -Type A -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Wait-Network([int]$MaxAttempts, [int]$SecondsBetween) {
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        if (Test-NetworkUp) { return $true }
        if ($i -lt $MaxAttempts) { Start-Sleep -Seconds $SecondsBetween }
    }
    return $false
}

try {
    Write-BootLog "Boot backup start (repo=$RepoRoot)."

    if (-not (Test-Path $BackupScript)) {
        throw "Missing backup script: $BackupScript"
    }

    Write-BootLog "Waiting for network..."
    if (-not (Wait-Network -MaxAttempts 24 -SecondsBetween 10)) {
        throw "Network not ready after 4 minutes."
    }

    # Neon/Supabase may need extra time right after reboot.
    Write-BootLog "Network up; waiting 60s before pg_dump..."
    Start-Sleep -Seconds 60

    $pg17Installer = Join-Path $RepoRoot "scripts\install-pg17-client.ps1"
    $repoPgDump = Join-Path $RepoRoot "tools\pgsql\bin\pg_dump.exe"
    if (-not (Test-Path $repoPgDump) -and (Test-Path $pg17Installer)) {
        Write-BootLog "Installing PostgreSQL 17 pg_dump to repo tools/..."
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $pg17Installer -RepoRoot $RepoRoot
    }

    $maxCycles = 3
    for ($cycle = 1; $cycle -le $maxCycles; $cycle++) {
        Write-BootLog "Backup attempt $cycle/$maxCycles..."
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BackupScript -RepoRoot $RepoRoot
        if ($LASTEXITCODE -eq 0) {
            Write-BootLog "Backup completed successfully."
            exit 0
        }
        if ($cycle -lt $maxCycles) {
            Write-BootLog "Attempt $cycle failed; retrying in 120s..."
            Start-Sleep -Seconds 120
        }
    }

    throw "Backup failed after $maxCycles attempts. See $LogDir\backup.log"
} catch {
    Write-BootLog "ERROR: $($_.Exception.Message)"
    exit 1
}
