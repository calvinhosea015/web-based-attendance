# Download PostgreSQL 17 Windows binaries (pg_dump) for Neon backups.
# Installs under <repo>/tools/pgsql so SYSTEM scheduled tasks can use it.

param(
    [string]$RepoRoot = (Join-Path $PSScriptRoot "..")
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
$ProdRepo = "D:\Calvin\web-based-attendance"
if ((Test-Path $ProdRepo) -and ($RepoRoot -ne $ProdRepo)) {
    $RepoRoot = $ProdRepo
}

$InstallDir = Join-Path $RepoRoot "tools\pgsql"
$BinDir = Join-Path $InstallDir "bin"
$PgDump = Join-Path $BinDir "pg_dump.exe"

if (Test-Path $PgDump) {
    & $PgDump --version
    Write-Host "Already installed: $PgDump"
    exit 0
}

$zipUrl = "https://get.enterprisedb.com/postgresql/postgresql-17.5-1-windows-x64-binaries.zip"
$zipFile = Join-Path $env:TEMP "postgresql-17-binaries.zip"

Write-Host "Downloading PostgreSQL 17 client tools..."
Invoke-WebRequest -Uri $zipUrl -OutFile $zipFile -UseBasicParsing

Write-Host "Extracting to $InstallDir ..."
$extractRoot = Join-Path $RepoRoot "tools"
New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
Expand-Archive -Path $zipFile -DestinationPath $extractRoot -Force
Remove-Item $zipFile -Force

# Zip contains pgsql/ folder.
if (-not (Test-Path $PgDump)) {
    $nested = Join-Path $extractRoot "pgsql\bin\pg_dump.exe"
    if (Test-Path $nested) {
        $PgDump = $nested
    } else {
        throw "pg_dump not found after extract. Expected $PgDump"
    }
}

& $PgDump --version
Write-Host "Installed: $PgDump"
