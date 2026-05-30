# Run the attendance API locally (Windows).
# Requires backend/.env — copy from backend/.env.production-local.example first.

$ErrorActionPreference = "Stop"
$root = Join-Path $PSScriptRoot ".." | Resolve-Path
$backend = Join-Path $root "backend"
$localNode = Join-Path (Split-Path $root -Parent) "node"
if (Test-Path (Join-Path $localNode "npm.cmd")) {
  $env:Path = "$localNode;$env:Path"
}

if (-not (Test-Path (Join-Path $backend ".env"))) {
  Write-Host ""
  Write-Host "Missing backend/.env" -ForegroundColor Red
  Write-Host "  1. Copy backend/.env.production-local.example to backend/.env"
  Write-Host "  2. Paste DATABASE_URL and secrets from Railway (same Neon database)"
  Write-Host "  3. Set ALLOWED_ORIGINS to your Vercel URL"
  Write-Host ""
  exit 1
}

Set-Location $backend
if (-not (Test-Path "node_modules")) {
  Write-Host "Installing backend dependencies..."
  npm install
}

Write-Host "Starting API on http://127.0.0.1:5001 (health: /health)"
Write-Host "For Vercel users, expose this port with a tunnel — see README section 16.1b"
Write-Host ""
npm start
