
$ErrorActionPreference = "Stop"
$Backend = Join-Path $PSScriptRoot ".." "backend" | Resolve-Path
$ServiceName = "attendance-api"

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    Write-Host "Installing pm2 globally..."
    npm install -g pm2 pm2-windows-startup
}

if (-not (Test-Path (Join-Path $Backend ".env"))) {
    throw "Create backend/.env first (copy from backend/.env.production-local.example)."
}

$NodeExe = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $NodeExe -and (Test-Path "D:\Calvin\node\node.exe")) {
    $NodeExe = "D:\Calvin\node\node.exe"
}
if (-not $NodeExe) {
    throw "Node.js not found in PATH. Install Node or add it to PATH first."
}

Set-Location $Backend
pm2 delete $ServiceName 2>$null
# npm start is unreliable under PM2 on Windows; run server.js with an explicit node path.
pm2 start server.js --name $ServiceName --cwd $Backend --interpreter $NodeExe
pm2 save

$BootInstaller = Join-Path $PSScriptRoot "install-backend-boot-task.ps1"
if (Test-Path $BootInstaller) {
    $IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
    if ($IsAdmin) {
        & $BootInstaller
    } else {
        Write-Host ""
        Write-Host "For boot without login, run PowerShell as Administrator:"
        Write-Host "  .\scripts\install-backend-boot-task.ps1"
    }
} elseif (Get-Command pm2-startup -ErrorAction SilentlyContinue) {
    pm2-startup install
    pm2 save
}

Write-Host ""
Write-Host "API registered as '$ServiceName'. Useful commands:"
Write-Host "  pm2 status"
Write-Host "  pm2 logs $ServiceName"
Write-Host "  http://127.0.0.1:5001/health"
