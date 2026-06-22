# Dump PostgreSQL database to backups/ using pg_dump.
# Reads DATABASE_URL from backend/.env. Retains backups for 14 days.

param(
    [string]$RepoRoot = (Join-Path $PSScriptRoot ".."),
    [int]$RetainDays = 14
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
$Backend = Join-Path $RepoRoot "backend"
$EnvFile = Join-Path $Backend ".env"
$BackupDir = Join-Path $RepoRoot "backups"
$LogDir = Join-Path $RepoRoot "logs"
$LogFile = Join-Path $LogDir "backup.log"

function Write-BackupLog([string]$Message) {
    $line = "$(Get-Date -Format o) $Message"
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    try {
        Add-Content -Path $LogFile -Value $line -ErrorAction Stop
    } catch {
        # SYSTEM-owned log files may block manual runs; still show on console.
        Write-Host $line
    }
}

if (-not (Test-Path $EnvFile)) {
    Write-BackupLog "ERROR: Missing $EnvFile"
    exit 1
}

$databaseUrl = $null
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*DATABASE_URL\s*=\s*(.+)\s*$') {
        $databaseUrl = $matches[1].Trim().Trim('"').Trim("'")
    }
}

if (-not $databaseUrl) {
    Write-BackupLog "ERROR: DATABASE_URL not set in $EnvFile"
    exit 1
}

$pgDump = $null
$pgDumpVersion = $null
$repoPgDump = Join-Path $RepoRoot "tools\pgsql\bin\pg_dump.exe"
$localPgDump = Join-Path $env:LOCALAPPDATA "attendance-pg\pgsql\bin\pg_dump.exe"
foreach ($candidate in @(
    $repoPgDump,
    $localPgDump,
    "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
    "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
    "pg_dump"
)) {
    if ($candidate -eq "pg_dump") {
        $cmd = Get-Command pg_dump -ErrorAction SilentlyContinue
        if ($cmd) {
            $pgDump = $cmd.Source
            break
        }
    } elseif (Test-Path $candidate) {
        $pgDump = $candidate
        break
    }
}

if ($pgDump) {
    try {
        $pgDumpVersion = (& $pgDump --version 2>$null) -replace '.* ', ''
    } catch {
        $pgDumpVersion = "unknown"
    }
}

if (-not $pgDump) {
    Write-BackupLog "ERROR: pg_dump not found. Install PostgreSQL client tools or add pg_dump to PATH."
    exit 1
}

# pg_dump on Windows does not accept channel_binding=require (Neon URLs often include it).
$pgDumpUrl = $databaseUrl -replace '[?&]channel_binding=[^&]*', ''
if ($pgDumpUrl -match '\?$') { $pgDumpUrl = $pgDumpUrl.TrimEnd('?') }

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$sqlFile = Join-Path $BackupDir "attendance-$stamp.sql"
$outFile = "$sqlFile.gz"
$errFile = Join-Path $LogDir "backup-last.err"

Write-BackupLog "Starting backup to $outFile (pg_dump $pgDumpVersion)"

$env:PGSSLMODE = "require"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
# Quote --dbname: Neon URLs contain & which breaks PowerShell if unquoted.
$dumpOutput = & $pgDump --dbname="$pgDumpUrl" --no-owner --no-acl -f $sqlFile 2>&1
$dumpExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($dumpExit -ne 0) {
    if (Test-Path $sqlFile) { Remove-Item $sqlFile -Force }
    $errText = ($dumpOutput | Out-String).Trim()
    if ($errText) {
        try { Set-Content -Path $errFile -Value $errText -Encoding UTF8 } catch { Write-Host $errText }
        Write-BackupLog "ERROR: pg_dump failed with exit code $dumpExit. See $errFile"
        ($errText -split "`n" | Select-Object -First 5) | ForEach-Object { Write-BackupLog "  pg_dump: $_" }
        if ($errText -match 'server version mismatch') {
            Write-BackupLog "HINT: Install PostgreSQL 17 pg_dump: .\scripts\install-pg17-client.ps1"
        }
    } else {
        Write-BackupLog "ERROR: pg_dump failed with exit code $dumpExit"
    }
    exit 1
}

# Compress with PowerShell (gzip.exe is not always available on Windows).
$bytes = [System.IO.File]::ReadAllBytes($sqlFile)
$ms = New-Object System.IO.MemoryStream
$gzip = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Compress)
$gzip.Write($bytes, 0, $bytes.Length)
$gzip.Close()
[System.IO.File]::WriteAllBytes($outFile, $ms.ToArray())
Remove-Item $sqlFile -Force

$sizeKb = [math]::Round((Get-Item $outFile).Length / 1KB, 1)
Write-BackupLog "Backup complete ($sizeKb KB)"

$cutoff = (Get-Date).AddDays(-$RetainDays)
Get-ChildItem $BackupDir -Filter "attendance-*.sql.gz" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        Write-BackupLog "Removing old backup $($_.Name)"
        Remove-Item $_.FullName -Force
    }

exit 0
