
param(
    [string]$ConfigFile = "D:\Calvin\cloudflared\vercel-sync.env",
    [string]$ExampleFile = (Join-Path (Join-Path $PSScriptRoot "..") "deploy\vercel-sync.env.example")
)

$ErrorActionPreference = "Stop"

Write-Host "=== Vercel auto-sync setup (quick tunnel) ==="
Write-Host ""
Write-Host "When the Cloudflare quick-tunnel URL changes after reboot, this updates"
Write-Host "VITE_API_BASE on Vercel and triggers a production redeploy."
Write-Host ""

if (-not (Test-Path (Split-Path $ConfigFile -Parent))) {
    New-Item -ItemType Directory -Force -Path (Split-Path $ConfigFile -Parent) | Out-Null
}

if (-not (Test-Path $ConfigFile)) {
    if (Test-Path $ExampleFile) {
        Copy-Item $ExampleFile $ConfigFile
    } else {
        @"
VERCEL_TOKEN=
VERCEL_PROJECT=web-based-attendance-117u
"@ | Set-Content $ConfigFile -Encoding UTF8
    }
}

Write-Host "1. Create a Vercel token: https://vercel.com/account/tokens"
Write-Host "   Scope: Full Account (or at least project env + deployments)"
Write-Host ""
Write-Host "2. Edit config file:"
Write-Host "   $ConfigFile"
Write-Host ""
Write-Host "   VERCEL_TOKEN=your_token_here"
Write-Host "   VERCEL_PROJECT=your-vercel-project-name"
Write-Host ""
Write-Host "   Project name is in Vercel -> Project -> Settings -> General"
Write-Host "   (often matches the URL prefix, e.g. web-based-attendance-117u)"
Write-Host ""
Write-Host "3. Test sync manually:"
Write-Host "   .\scripts\sync-vercel-api-url.ps1 -Force"
Write-Host ""
Write-Host "4. After reboot, tunnel boot task runs sync automatically when URL changes."
Write-Host ""
Write-Host "Log: C:\Users\calvin\.pm2\logs\vercel-sync.log"
Write-Host ""
Write-Host "Note: each URL change triggers a Vercel rebuild (~1-2 min)."
Write-Host "For zero redeploys, use a named Cloudflare tunnel with your own domain instead."

if (-not (Test-Path "D:\Calvin\cloudflared")) {
    New-Item -ItemType Directory -Force -Path "D:\Calvin\cloudflared" | Out-Null
}
icacls $ConfigFile /grant "$env:USERNAME`:F" /Q 2>$null | Out-Null
icacls (Split-Path $ConfigFile -Parent) /grant "SYSTEM:(OI)(CI)F" /T /Q | Out-Null

Write-Host ""
Write-Host "Config template ready at: $ConfigFile"
Write-Host "Add your VERCEL_TOKEN, then test sync."
