# Start Cloudflare tunnel at Windows boot (no user login required).
# Invoked by the "Attendance Tunnel Boot" scheduled task.
#
# Named tunnel (stable URL): config.yml + cert.pem in D:\Calvin\cloudflared
#   Run scripts/setup-named-tunnel.ps1 once with your Cloudflare domain.
# Quick tunnel (URL changes each restart): fallback when config.yml is not set up.

$ErrorActionPreference = "Stop"

$CloudflaredDir = "D:\Calvin\cloudflared"
$CloudflaredExe = Join-Path $CloudflaredDir "cloudflared.exe"
$ConfigFile = Join-Path $CloudflaredDir "config.yml"
$CertFile = Join-Path $CloudflaredDir "cert.pem"
$TunnelLog = Join-Path $CloudflaredDir "tunnel.log"
try {
    Add-Content -Path $TunnelLog -Value "" -ErrorAction Stop
} catch {
    # SYSTEM-owned / locked log — write somewhere the current principal can use.
    $TunnelLog = Join-Path $env:TEMP "attendance-cloudflared-tunnel.log"
}
$TunnelUrlFile = Join-Path $CloudflaredDir "tunnel-url.txt"
$TunnelModeFile = Join-Path $CloudflaredDir "tunnel-mode.txt"
$Pm2Home = "C:\Users\calvin\.pm2"
$LogDir = Join-Path $Pm2Home "logs"
$LogFile = Join-Path $LogDir "boot-tunnel.log"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

function Write-BootLog([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $LogFile -Value $line
}

function Test-ApiHealthy {
    try {
        $health = Invoke-WebRequest -Uri "http://127.0.0.1:5001/health" -UseBasicParsing -TimeoutSec 10
        return ($health.Content -match '"ok"\s*:\s*true')
    } catch {
        return $false
    }
}

function Wait-ApiHealthy([int]$MaxAttempts, [int]$SecondsBetween) {
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        if (Test-ApiHealthy) { return $true }
        if ($i -lt $MaxAttempts) {
            Start-Sleep -Seconds $SecondsBetween
        }
    }
    return $false
}

function Get-CloudflaredProcess {
    Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue
}

function Test-TunnelHealthy([string]$BaseUrl) {
    for ($i = 1; $i -le 12; $i++) {
        try {
            $health = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec 15
            if ($health.Content -match '"ok"\s*:\s*true') { return $true }
        } catch {
            if ($i -lt 12) { Start-Sleep -Seconds 5 }
        }
    }
    return $false
}

function Test-NamedTunnelConfigured {
    if (-not (Test-Path $ConfigFile)) { return $false }
    if (-not (Test-Path $CertFile)) { return $false }
    $config = Get-Content $ConfigFile -Raw
    if ($config -notmatch '(?m)^tunnel:\s*\S+') { return $false }
    if ($config -notmatch '(?m)^credentials-file:\s*\S+') { return $false }
    if ($config -notmatch '(?m)^ingress:') { return $false }
    $credMatch = [regex]::Match($config, 'credentials-file:\s*(.+)', 'IgnoreCase')
    if (-not $credMatch.Success) { return $false }
    $credPath = $credMatch.Groups[1].Value.Trim()
    return (Test-Path $credPath)
}

function Get-NamedTunnelUrl {
    if (Test-Path $TunnelUrlFile) {
        $url = (Get-Content $TunnelUrlFile -Raw).Trim()
        if ($url) { return $url.TrimEnd('/') }
    }
    $config = Get-Content $ConfigFile -Raw
    $hostMatch = [regex]::Match($config, '(?m)^\s*-\s*hostname:\s*(\S+)')
    if ($hostMatch.Success) {
        return "https://$($hostMatch.Groups[1].Value.Trim())"
    }
    return $null
}

function Get-TunnelUrlFromLog([long]$AfterByteOffset = 0) {
    if (-not (Test-Path $TunnelLog)) { return $null }
    $content = Get-Content -Path $TunnelLog -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return $null }
    if ($AfterByteOffset -gt 0) {
        if ($AfterByteOffset -ge $content.Length) { return $null }
        $content = $content.Substring([int]$AfterByteOffset)
    }
    $matches = [regex]::Matches($content, 'https://[a-z0-9-]+\.trycloudflare\.com', 'IgnoreCase')
    if ($matches.Count -eq 0) { return $null }
    return $matches[$matches.Count - 1].Value
}

function Wait-TunnelUrlFromLog([int]$MaxAttempts, [int]$SecondsBetween, [long]$AfterByteOffset) {
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        $url = Get-TunnelUrlFromLog -AfterByteOffset $AfterByteOffset
        if ($url) { return $url }
        if ($i -lt $MaxAttempts) {
            Start-Sleep -Seconds $SecondsBetween
        }
    }
    return $null
}

function Stop-CloudflaredIfRunning {
    $existing = Get-CloudflaredProcess
    if ($existing) {
        Write-BootLog "Stopping cloudflared PID $($existing.ProcessId)."
        Stop-Process -Id $existing.ProcessId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 3
    }
}

function Start-NamedTunnel {
    param([string]$TunnelUrl)

    Write-BootLog "Starting named cloudflared tunnel (stable URL)..."
    Start-Process -FilePath $CloudflaredExe -ArgumentList @(
        "tunnel",
        "--config", $ConfigFile,
        "run",
        "--protocol", "http2",
        "--logfile", $TunnelLog,
        "--loglevel", "info",
        "--no-autoupdate"
    ) -WindowStyle Hidden

    if (Test-TunnelHealthy $TunnelUrl) {
        Set-Content -Path $TunnelUrlFile -Value $TunnelUrl -Encoding UTF8
        Set-Content -Path $TunnelModeFile -Value "named" -Encoding UTF8
        Write-BootLog "Named tunnel healthy at $TunnelUrl"
        return $true
    }
    return $false
}

function Invoke-VercelSyncIfConfigured {
    $syncScript = Join-Path (Split-Path $PSScriptRoot -Parent) "scripts\sync-vercel-api-url.ps1"
    if (-not (Test-Path $syncScript)) {
        $syncScript = "D:\Calvin\web-based-attendance\scripts\sync-vercel-api-url.ps1"
    }
    $vercelConfig = "D:\Calvin\cloudflared\vercel-sync.env"
    if (-not ((Test-Path $syncScript) -and (Test-Path $vercelConfig))) {
        return
    }
    try {
        Write-BootLog "Syncing VITE_API_BASE to Vercel..."
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript
        if ($LASTEXITCODE -eq 0) {
            Write-BootLog "Vercel sync completed."
        } else {
            Write-BootLog "Vercel sync exited with code $LASTEXITCODE (see vercel-sync.log)."
        }
    } catch {
        Write-BootLog "Vercel sync failed: $($_.Exception.Message)"
    }
}

function Resolve-LiveQuickTunnelUrl([long]$LogOffset) {
    for ($i = 1; $i -le 36; $i++) {
        $content = if (Test-Path $TunnelLog) { Get-Content $TunnelLog -Raw } else { '' }
        $segment = $content
        if ($LogOffset -gt 0 -and $LogOffset -lt $content.Length) {
            $segment = $content.Substring([int]$LogOffset)
        } elseif ($LogOffset -ge $content.Length) {
            $segment = ''
        }
        $matches = [regex]::Matches($segment, 'https://[a-z0-9-]+\.trycloudflare\.com', 'IgnoreCase')
        for ($j = $matches.Count - 1; $j -ge 0; $j--) {
            $url = $matches[$j].Value
            if (Test-TunnelHealthy $url) { return $url }
        }
        if ($i -lt 36) { Start-Sleep -Seconds 5 }
    }
    return $null
}

function Start-QuickTunnel {
    Write-BootLog "Starting cloudflared quick tunnel (URL will change on restart)..."
    if (Test-Path $TunnelLog) {
        $bak = "$TunnelLog.bak"
        if (Test-Path $bak) { Remove-Item $bak -Force -ErrorAction SilentlyContinue }
        Move-Item $TunnelLog $bak -Force -ErrorAction SilentlyContinue
        if (Test-Path $TunnelLog) {
            # Still locked: truncate instead of failing boot.
            Set-Content -Path $TunnelLog -Value "" -Encoding UTF8 -ErrorAction SilentlyContinue
        }
    }
    $logOffset = 0
    Start-Process -FilePath $CloudflaredExe -ArgumentList @(
        "tunnel",
        "--url", "http://127.0.0.1:5001",
        "--protocol", "http2",
        "--logfile", $TunnelLog,
        "--loglevel", "info",
        "--no-autoupdate"
    ) -WindowStyle Hidden

    $tunnelUrl = Wait-TunnelUrlFromLog -MaxAttempts 36 -SecondsBetween 5 -AfterByteOffset $logOffset
    if (-not $tunnelUrl) {
        throw "Timed out waiting for quick tunnel URL in $TunnelLog"
    }

    Write-BootLog "Quick tunnel URL candidate: $tunnelUrl"
    $liveUrl = Resolve-LiveQuickTunnelUrl -LogOffset $logOffset
    if ($liveUrl) {
        $tunnelUrl = $liveUrl
    }

    Set-Content -Path $TunnelUrlFile -Value $tunnelUrl -Encoding UTF8
    Set-Content -Path $TunnelModeFile -Value "quick" -Encoding UTF8
    Write-BootLog "Quick tunnel URL: $tunnelUrl"

    if (Test-TunnelHealthy $tunnelUrl) {
        Write-BootLog "Quick tunnel started."
        Invoke-VercelSyncIfConfigured
        return $true
    }

    Write-BootLog "WARN: Primary URL failed health check; trying Vercel sync with live URL discovery..."
    Invoke-VercelSyncIfConfigured
    throw "Quick tunnel URL assigned but /health check failed via $tunnelUrl"
}

try {
    Write-BootLog "Boot start (cloudflared=$CloudflaredExe)."

    if (-not (Test-Path $CloudflaredExe)) {
        throw "cloudflared not found at $CloudflaredExe"
    }

    $useNamed = Test-NamedTunnelConfigured
    $expectedUrl = if ($useNamed) { Get-NamedTunnelUrl } else { $null }

    $existing = Get-CloudflaredProcess
    if ($existing -and -not $useNamed) {
        $liveUrl = Resolve-LiveQuickTunnelUrl -LogOffset 0
        if ($liveUrl) {
            Set-Content -Path $TunnelUrlFile -Value $liveUrl -Encoding UTF8
            Write-BootLog "Quick tunnel already healthy at $liveUrl"
            Invoke-VercelSyncIfConfigured
            exit 0
        }
    }
    if ($existing -and $expectedUrl -and (Test-TunnelHealthy $expectedUrl)) {
        Write-BootLog "Tunnel already healthy at $expectedUrl; skipping start."
        exit 0
    }

    if ($existing) {
        Stop-CloudflaredIfRunning
    }

    Write-BootLog "Waiting for API on port 5001..."
    if (-not (Wait-ApiHealthy -MaxAttempts 90 -SecondsBetween 20)) {
        $apiBoot = "D:\Calvin\web-based-attendance\scripts\start-backend-at-boot.ps1"
        if (Test-Path $apiBoot) {
            Write-BootLog "API still down; running start-backend-at-boot.ps1 once..."
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $apiBoot
        }
        if (-not (Wait-ApiHealthy -MaxAttempts 90 -SecondsBetween 20)) {
            throw "API not healthy on port 5001; cannot start tunnel."
        }
    }

    if ($useNamed) {
        if (-not $expectedUrl) {
            throw "Named tunnel configured but hostname not found in config.yml or tunnel-url.txt"
        }
        if (Start-NamedTunnel -TunnelUrl $expectedUrl) {
            exit 0
        }
        throw "Named tunnel started but /health check failed via $expectedUrl"
    }

    Start-QuickTunnel | Out-Null
    exit 0
} catch {
    Write-BootLog "ERROR: $($_.Exception.Message)"
    Invoke-VercelSyncIfConfigured
    exit 1
}
