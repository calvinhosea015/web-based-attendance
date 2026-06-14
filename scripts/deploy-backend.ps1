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
    throw "Missing backend/.env - create it before deploying (see backend/.env.production-local.example)."
}

Set-Location $Backend
Write-Host "Installing dependencies..."
npm ci --omit=dev

Write-Host "Restarting API..."
$RestartScript = Join-Path $RepoRoot "scripts\restart-api.ps1"
if (Test-Path $RestartScript) {
    & $RestartScript -RepoRoot $RepoRoot
} elseif (Get-Command pm2 -ErrorAction SilentlyContinue) {
    $pm2List = pm2 jlist 2>$null | ConvertFrom-Json
    $existing = $pm2List | Where-Object { $_.name -eq $ServiceName }
    if ($existing) {
        pm2 restart $ServiceName
    } else {
        $NodeExe = if (Test-Path "D:\Calvin\node\node.exe") { "D:\Calvin\node\node.exe" } else { (Get-Command node).Source }
        pm2 start server.js --name $ServiceName --cwd $Backend --interpreter $NodeExe
    }
    pm2 save
} else {
    throw "No restart script found. Run .\scripts\install-backend-boot-task.ps1 first."
}

Write-Host "Done. Health check: http://127.0.0.1:5001/health"
