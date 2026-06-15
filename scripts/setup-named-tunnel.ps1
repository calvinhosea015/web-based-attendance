
param(
    [Parameter(Mandatory = $true)]
    [string]$Hostname,

    [string]$TunnelName = "attendance-api",
    [string]$CloudflaredDir = "D:\Calvin\cloudflared",
    [int]$ApiPort = 5001
)

$ErrorActionPreference = "Stop"

$CloudflaredExe = Join-Path $CloudflaredDir "cloudflared.exe"
$CertFile = Join-Path $CloudflaredDir "cert.pem"
$ConfigFile = Join-Path $CloudflaredDir "config.yml"
$TunnelUrlFile = Join-Path $CloudflaredDir "tunnel-url.txt"
$TunnelModeFile = Join-Path $CloudflaredDir "tunnel-mode.txt"

if (-not (Test-Path $CloudflaredExe)) {
    throw "Install cloudflared at $CloudflaredExe first."
}

$Hostname = $Hostname.Trim().ToLowerInvariant()
if ($Hostname -match '^https?://') {
    $Hostname = ([uri]$Hostname).Host
}
if ($Hostname -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') {
    throw "Invalid hostname '$Hostname'. Example: api.yourdomain.com"
}

if (-not (Test-Path $CloudflaredDir)) {
    New-Item -ItemType Directory -Force -Path $CloudflaredDir | Out-Null
}

function Invoke-Cloudflared {
    param([string[]]$SubArgs)
    $output = & $CloudflaredExe tunnel --origincert $CertFile @SubArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($output | Out-String)
    }
    return $output
}

function Import-CloudflaredCertIfNeeded {
    if (Test-Path $CertFile) { return }
    $userCert = Join-Path $env:USERPROFILE ".cloudflared\cert.pem"
    if (Test-Path $userCert) {
        Copy-Item $userCert $CertFile -Force
        Write-Host "Copied cert.pem from $userCert"
    }
}

function Start-CloudflaredLogin {
    Write-Host "Step 1: Log in to Cloudflare."
    Write-Host "On Windows Server the browser often does NOT open by itself."
    Write-Host "When a URL appears below, copy it into Edge/Chrome on this PC (or your laptop)."
    Write-Host "Choose the zone that contains '$Hostname', then approve access."
    Write-Host ""

    $loginArgs = @("tunnel", "--origincert", $CertFile, "login")
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $CloudflaredExe
    $psi.Arguments = ($loginArgs | ForEach-Object {
        if ($_ -match '\s') { "`"$_`"" } else { $_ }
    }) -join ' '
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $loginUrl = $null
    $deadline = (Get-Date).AddMinutes(5)

    while (-not $proc.HasExited -and (Get-Date) -lt $deadline) {
        while ($proc.StandardOutput.Peek() -ge 0) {
            $line = $proc.StandardOutput.ReadLine()
            if ($line) {
                Write-Host $line
                if ($line -match '(https://[^\s''"]+)') {
                    $candidate = $Matches[1].TrimEnd('.')
                    if ($candidate -match 'cloudflare|argotunnel') {
                        $loginUrl = $candidate
                    }
                }
            }
        }
        while ($proc.StandardError.Peek() -ge 0) {
            $line = $proc.StandardError.ReadLine()
            if ($line) { Write-Host $line }
        }
        if ($loginUrl) {
            Write-Host ""
            Write-Host ">>> Login URL (open in a browser if it did not open):" -ForegroundColor Yellow
            Write-Host $loginUrl -ForegroundColor Cyan
            Write-Host ""
            try {
                Start-Process $loginUrl | Out-Null
            } catch {
                Write-Host "Could not launch browser automatically. Paste the URL above into Edge/Chrome."
            }
            $loginUrl = 'shown'
        }
        if (Test-Path $CertFile) { break }
        Import-CloudflaredCertIfNeeded
        if (Test-Path $CertFile) { break }
        Start-Sleep -Milliseconds 300
    }

    if (-not $proc.HasExited) {
        $proc.Kill()
        $proc.WaitForExit()
    } else {
        while ($proc.StandardOutput.Peek() -ge 0) {
            Write-Host $proc.StandardOutput.ReadLine()
        }
        while ($proc.StandardError.Peek() -ge 0) {
            Write-Host $proc.StandardError.ReadLine()
        }
    }

    Import-CloudflaredCertIfNeeded
    if (-not (Test-Path $CertFile)) {
        throw @"
Login did not complete - cert.pem was not created at:
  $CertFile

Try logging in manually, then re-run this script:
  & '$CloudflaredExe' tunnel --origincert '$CertFile' login

After the browser shows success, run setup again with the same -Hostname.
"@
    }

    Write-Host "Cloudflare login OK."
    Write-Host ""
}

Write-Host "=== Named Cloudflare tunnel setup ==="
Write-Host "Hostname: $Hostname"
Write-Host "Tunnel name: $TunnelName"
Write-Host ""

if (-not (Test-Path $CertFile)) {
    Start-CloudflaredLogin
    Import-CloudflaredCertIfNeeded
}

if (-not (Test-Path $CertFile)) {
    throw "Missing $CertFile after login."
}

Write-Host "Step 2: Create tunnel '$TunnelName' (skip if it already exists)..."
$credentialsFile = $null
$tunnelId = $null

$existing = Invoke-Cloudflared @("list") | Out-String
if ($existing -match "(?m)^[0-9a-f-]{36}\s+$([regex]::Escape($TunnelName))\s") {
    $tunnelId = ($existing | Select-String -Pattern "([0-9a-f-]{36})\s+$([regex]::Escape($TunnelName))\s").Matches[0].Groups[1].Value
    Write-Host "Tunnel already exists: $tunnelId"
} else {
    $credentialsFile = Join-Path $CloudflaredDir "$TunnelName.json"
    $createOut = Invoke-Cloudflared @(
        "create",
        "--credentials-file", $credentialsFile,
        $TunnelName
    ) | Out-String
    if ($createOut -match '([0-9a-f-]{36})') {
        $tunnelId = $Matches[1]
    }
    if (-not $tunnelId -and (Test-Path $credentialsFile)) {
        $meta = Get-Content $credentialsFile -Raw | ConvertFrom-Json
        $tunnelId = $meta.TunnelID
    }
    if (-not $tunnelId) {
        throw "Could not determine tunnel ID after create."
    }
    $canonicalCreds = Join-Path $CloudflaredDir "$tunnelId.json"
    if ($credentialsFile -ne $canonicalCreds -and (Test-Path $credentialsFile)) {
        Move-Item $credentialsFile $canonicalCreds -Force
    }
    $credentialsFile = $canonicalCreds
    Write-Host "Created tunnel: $tunnelId"
}

if (-not $credentialsFile) {
    $credentialsFile = Join-Path $CloudflaredDir "$tunnelId.json"
}
if (-not (Test-Path $credentialsFile)) {
    throw "Missing credentials file: $credentialsFile"
}

Write-Host "Step 3: Route DNS $Hostname -> tunnel..."
try {
    Invoke-Cloudflared @("route", "dns", $TunnelName, $Hostname) | Out-Null
} catch {
    Write-Host "DNS route note: $($_.Exception.Message)"
    Write-Host "If the record already exists, you can ignore this."
}

Write-Host "Step 4: Write config.yml..."
$config = @"
tunnel: $tunnelId
credentials-file: $credentialsFile
origincert: $CertFile

ingress:
  - hostname: $Hostname
    service: http://127.0.0.1:$ApiPort
  - service: http_status:404
"@
Set-Content -Path $ConfigFile -Value $config -Encoding UTF8

$stableUrl = "https://$Hostname"
Set-Content -Path $TunnelUrlFile -Value $stableUrl -Encoding UTF8
Set-Content -Path $TunnelModeFile -Value "named" -Encoding UTF8

Write-Host "Step 5: Grant SYSTEM access for boot task..."
icacls $CloudflaredDir /grant "SYSTEM:(OI)(CI)F" /T /Q | Out-Null

Write-Host ""
Write-Host "=== Done ==="
Write-Host "Stable API URL: $stableUrl"
Write-Host "Health check:   $stableUrl/health"
Write-Host ""
Write-Host "One-time Vercel setup:"
Write-Host "  VITE_API_BASE=$stableUrl/api"
Write-Host "Then redeploy the frontend on Vercel."
Write-Host ""
Write-Host "Restart tunnel now:"
Write-Host "  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force"
Write-Host "  Start-ScheduledTask -TaskName 'Attendance Tunnel Boot'"
Write-Host ""
Write-Host "Or test manually:"
Write-Host "  & '$CloudflaredExe' tunnel --config '$ConfigFile' run"
