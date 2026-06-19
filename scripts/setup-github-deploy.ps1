# One-time setup: let GitHub Actions SSH into this PC and run deploy-backend.ps1.
# Run in PowerShell (Administrator recommended for firewall check).

param(
    [string]$RepoPath = "D:\Calvin\web-based-attendance",
    [string]$KeyName = "github_actions_deploy",
    [string]$TunnelHost = "",
    [int]$TunnelPort = 0
)

$ErrorActionPreference = "Stop"
$sshDir = Join-Path $env:USERPROFILE ".ssh"
$keyPath = Join-Path $sshDir $KeyName
$authKeys = Join-Path $sshDir "authorized_keys"

Write-Host ""
Write-Host "=== GitHub Actions deploy setup ===" -ForegroundColor Cyan
Write-Host ""

# --- Diagnostics ---
$sshd = Get-Service sshd -ErrorAction SilentlyContinue
if ($sshd -and $sshd.Status -eq "Running") {
    Write-Host "[OK] OpenSSH Server (sshd) is running" -ForegroundColor Green
} else {
    Write-Host "[!!] OpenSSH Server is not running. Install/start it:" -ForegroundColor Red
    Write-Host "     Settings -> Apps -> Optional features -> OpenSSH Server"
    Write-Host "     Then: Start-Service sshd; Set-Service sshd -StartupType Automatic"
}

$listen22 = Get-NetTCPConnection -LocalPort 22 -State Listen -ErrorAction SilentlyContinue
if ($listen22) {
    Write-Host "[OK] Port 22 is listening" -ForegroundColor Green
} else {
    Write-Host "[!!] Port 22 is not listening" -ForegroundColor Red
}

if (Test-Path $RepoPath) {
    Write-Host "[OK] Repo path exists: $RepoPath" -ForegroundColor Green
} else {
    Write-Host "[!!] Repo path missing: $RepoPath" -ForegroundColor Red
    Write-Host "     Use -RepoPath if your clone is elsewhere."
}

if (Test-Path (Join-Path $RepoPath "backend\.env")) {
    Write-Host "[OK] backend/.env exists" -ForegroundColor Green
} else {
    Write-Host "[!!] Missing backend/.env at $RepoPath" -ForegroundColor Red
}

if (Test-Path (Join-Path $RepoPath "scripts\restart-api.ps1")) {
    Write-Host "[OK] restart-api.ps1 found (deploy can restart API)" -ForegroundColor Green
} else {
    Write-Host "[!!] Missing scripts/restart-api.ps1" -ForegroundColor Red
}

if ($TunnelHost) {
    $deployHost = $TunnelHost
    Write-Host "[..] Tunnel SSH host (DEPLOY_HOST): $deployHost" -ForegroundColor Yellow
} else {
    try {
        $deployHost = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 10).ip
        Write-Host "[..] Public IP (DEPLOY_HOST): $deployHost" -ForegroundColor Yellow
    } catch {
        Write-Host "[!!] Could not detect public IP" -ForegroundColor Red
        $deployHost = "<your-ssh-host>"
    }
}
if ($TunnelPort -gt 0) {
    Write-Host "[..] Tunnel SSH port (DEPLOY_PORT): $TunnelPort" -ForegroundColor Yellow
}

Write-Host ""

# --- SSH key for GitHub Actions ---
New-Item -ItemType Directory -Force -Path $sshDir | Out-Null

if (-not (Test-Path $keyPath)) {
    Write-Host "Generating SSH key pair: $keyPath"
    ssh-keygen -t ed25519 -f $keyPath -N '""' -C "github-actions-deploy"
} else {
    Write-Host "Using existing key: $keyPath"
}

$pubLine = (Get-Content "$keyPath.pub" -Raw).Trim()

function Test-IsAdministratorsGroupMember {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or
        ($identity.Groups | ForEach-Object { $_.Translate([Security.Principal.SecurityIdentifier]).Value } | Where-Object { $_ -eq "S-1-5-32-544" })
}

function Test-IsElevatedAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-AuthorizedKeysFile {
    param(
        [string]$Path,
        [string[]]$Lines
    )
    $unique = @($Lines | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $utf8 = New-Object System.Text.UTF8Encoding $false
    $text = ($unique -join "`n") + "`n"
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $text, $utf8)
}

function Read-AuthorizedKeysFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return @() }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($Path)
        if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
            $text = [System.Text.Encoding]::Unicode.GetString($bytes)
        } elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
            $text = [System.Text.Encoding]::BigEndianUnicode.GetString($bytes)
        } else {
            $text = [System.Text.Encoding]::UTF8.GetString($bytes)
        }
        return @($text -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    } catch {
        return @()
    }
}

function Set-AuthorizedKeysAcl {
    param([string]$Path)
    icacls $Path /inheritance:r | Out-Null
    icacls $Path /grant "SYSTEM:(F)" | Out-Null
    icacls $Path /grant "Administrators:(F)" | Out-Null
}

function Install-DeployPublicKey {
    param([string]$Path)
    $existing = Read-AuthorizedKeysFile -Path $Path
    if ($existing -notcontains $pubLine) {
        $existing += $pubLine
    }
    Write-AuthorizedKeysFile -Path $Path -Lines $existing
    Set-AuthorizedKeysAcl -Path $Path
    Write-Host "[OK] Wrote public key (UTF-8) to $Path" -ForegroundColor Green
}

$isAdminUser = [bool](Test-IsAdministratorsGroupMember)
if ($isAdminUser) {
    Write-Host "[..] Account is in Administrators; Windows SSH uses administrators_authorized_keys" -ForegroundColor Yellow
    $adminKeys = "C:\ProgramData\ssh\administrators_authorized_keys"
    if (-not (Test-IsElevatedAdmin)) {
        Write-Host "[!!] Re-run this script as Administrator to update $adminKeys" -ForegroundColor Red
    } else {
        Install-DeployPublicKey -Path $adminKeys
        Restart-Service sshd
        Write-Host "[OK] Restarted sshd service" -ForegroundColor Green
    }
} else {
    Install-DeployPublicKey -Path $authKeys
    Restart-Service sshd -ErrorAction SilentlyContinue
}

# --- SSH test ---
Write-Host ""
if ($TunnelHost -and $TunnelPort -gt 0) {
    Write-Host "Testing SSH login via tunnel $TunnelHost`:$TunnelPort..."
    $sshTarget = "$env:USERNAME@$TunnelHost"
    $sshPortArg = @("-p", "$TunnelPort")
} else {
    Write-Host "Testing SSH login to localhost..."
    $sshTarget = "$env:USERNAME@127.0.0.1"
    $sshPortArg = @()
}
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$test = & ssh @sshPortArg -i $keyPath -o StrictHostKeyChecking=no -o BatchMode=yes $sshTarget "echo ok" 2>&1
$sshExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($sshExit -eq 0 -and "$test" -match "ok") {
    Write-Host "[OK] SSH key login works" -ForegroundColor Green
} else {
    Write-Host "[!!] SSH test failed: $test" -ForegroundColor Red
    if ($isAdminUser) {
        Write-Host "     Re-run this script as Administrator to rewrite administrators_authorized_keys as UTF-8."
    } else {
        Write-Host "     Check C:\ProgramData\ssh\sshd_config has PubkeyAuthentication yes"
    }
}

# --- GitHub secrets ---
Write-Host ""
Write-Host "=== Add these GitHub repo secrets ===" -ForegroundColor Cyan
Write-Host "https://github.com/calvinhosea015/web-based-attendance/settings/secrets/actions"
Write-Host ""
Write-Host "DEPLOY_HOST       = $deployHost"
if ($TunnelPort -gt 0) {
    Write-Host "DEPLOY_PORT       = $TunnelPort"
} elseif ($TunnelHost) {
    Write-Host "DEPLOY_PORT       = <your-tunnel-port>"
}
Write-Host "DEPLOY_USER       = $env:USERNAME"
Write-Host "DEPLOY_REPO_PATH  = $RepoPath"
Write-Host ""
Write-Host "DEPLOY_SSH_KEY    = paste the ENTIRE private key below (including BEGIN/END lines):"
Write-Host "-----"
Get-Content $keyPath
Write-Host "-----"
Write-Host ""
if ($TunnelHost) {
    Write-Host "Using SSH tunnel — no router port forward needed."
} else {
    Write-Host "Router: forward TCP port 22 to this PC local IP on your LAN."
    Write-Host "Or use a tunnel (e.g. my.id) and re-run with -TunnelHost and -TunnelPort."
}
Write-Host ""
Write-Host "After secrets are saved, test from GitHub Actions (Deploy backend, Run workflow)."
Write-Host ""
