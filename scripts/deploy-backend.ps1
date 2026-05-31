# Pull latest backend code and restart the API on this Windows server.
# Called manually or by GitHub Actions over SSH after you push from your laptop.
#
# One-time setup (run as Administrator on the server):
#   npm install -g pm2
#   pm2 install pm2-windows-startup
#   pm2-startup install
#   .\scripts\install-backend-service.ps1

param(
    [string]$RepoRoot = (Join-Path $PSScriptRoot ".."),
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path $RepoRoot).Path
$Backend = Join-Path $RepoRoot "backend"
$ServiceName = "attendance-api"

Write-Host "Deploying backend from $RepoRoot (branch: $Branch)"

Set-Location $RepoRoot

if (-not (Test-Path (Join-Path $RepoRoot ".git"))) {
    throw "Not a git repository: $RepoRoot"
}

git fetch origin $Branch
git checkout $Branch
git reset --hard "origin/$Branch"

if (-not (Test-Path (Join-Path $Backend ".env"))) {
    throw "Missing backend/.env — create it before deploying (see backend/.env.production-local.example)."
}

Set-Location $Backend
Write-Host "Installing dependencies..."
npm ci --omit=dev

Write-Host "Restarting API..."
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    $pm2List = pm2 jlist 2>$null | ConvertFrom-Json
    $existing = $pm2List | Where-Object { $_.name -eq $ServiceName }
    if ($existing) {
        pm2 restart $ServiceName
    } else {
        pm2 start npm --name $ServiceName -- start
    }
    pm2 save
} else {
    Write-Warning "pm2 not found — starting npm in a new window. Install pm2 for reliable restarts:"
    Write-Warning "  npm install -g pm2"
    Write-Warning "  .\scripts\install-backend-service.ps1"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Backend'; npm start"
}

Write-Host "Done. Health check: http://127.0.0.1:5001/health"
