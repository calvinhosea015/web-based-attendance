# Sync VITE_API_BASE on Vercel when the quick-tunnel URL changes.
# Called from start-tunnel-at-boot.ps1 (or manually after tunnel start).
#
# One-time config: D:\Calvin\cloudflared\vercel-sync.env
#   VERCEL_TOKEN=...           # https://vercel.com/account/tokens
#   VERCEL_PROJECT=...         # project name or id (e.g. web-based-attendance-117u)
#   VERCEL_TEAM_ID=            # optional, for team accounts

param(
    [string]$TunnelUrlFile = "D:\Calvin\cloudflared\tunnel-url.txt",
    [string]$ConfigFile = "D:\Calvin\cloudflared\vercel-sync.env",
    [string]$LastSyncedFile = "D:\Calvin\cloudflared\vercel-last-api-base.txt",
    [string]$LogFile = "C:\Users\calvin\.pm2\logs\vercel-sync.log",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-SyncLog([string]$Message) {
    $dir = Split-Path $LogFile -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -Path $LogFile -Value $line
}

function Read-EnvFile([string]$FilePath) {
    $vars = @{}
    foreach ($line in Get-Content $FilePath) {
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $name, $value = $line -split '=', 2
        $vars[$name.Trim()] = $value.Trim().Trim('"').Trim("'")
    }
    return $vars
}

function Add-VercelQuery([string]$ResourcePath, [hashtable]$Query) {
    if (-not $Query -or $Query.Count -eq 0) { return $ResourcePath }
    $qs = ($Query.GetEnumerator() | ForEach-Object {
        "{0}={1}" -f [uri]::EscapeDataString($_.Key), [uri]::EscapeDataString([string]$_.Value)
    }) -join '&'
    if ($ResourcePath -match '\?') { return "$ResourcePath&$qs" }
    return "$ResourcePath`?$qs"
}

function Invoke-VercelApi {
    param(
        [string]$Method,
        [string]$ResourcePath,
        [string]$Token,
        [hashtable]$Query = @{},
        $Body = $null
    )

    $uri = "https://api.vercel.com" + (Add-VercelQuery $ResourcePath $Query)
    $params = @{
        Method      = $Method
        Uri         = $uri
        Headers     = @{ Authorization = "Bearer $Token" }
        ContentType = "application/json"
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 6 -Compress)
    }
    return Invoke-RestMethod @params
}

function Test-TunnelHealthy([string]$BaseUrl) {
    try {
        $health = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec 15
        return ($health.Content -match '"ok"\s*:\s*true')
    } catch {
        return $false
    }
}

function Get-TunnelUrlCandidatesFromLog([long]$AfterByteOffset = 0) {
    $TunnelLog = "D:\Calvin\cloudflared\tunnel.log"
    if (-not (Test-Path $TunnelLog)) { return @() }
    $content = Get-Content -Path $TunnelLog -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return @() }
    if ($AfterByteOffset -gt 0) {
        if ($AfterByteOffset -ge $content.Length) { return @() }
        $content = $content.Substring([int]$AfterByteOffset)
    }
    $found = [regex]::Matches($content, 'https://[a-z0-9-]+\.trycloudflare\.com', 'IgnoreCase')
    if ($found.Count -eq 0) { return @() }
    $unique = New-Object System.Collections.Generic.List[string]
    foreach ($m in $found) {
        $v = $m.Value
        if ($unique -notcontains $v) { [void]$unique.Add($v) }
    }
    return $unique
}

function Resolve-LiveTunnelUrl {
    param(
        [string]$TunnelUrlFile = "D:\Calvin\cloudflared\tunnel-url.txt",
        [long]$LogOffset = 0
    )

    $candidates = @(Get-TunnelUrlCandidatesFromLog -AfterByteOffset $LogOffset)
    for ($i = $candidates.Count - 1; $i -ge 0; $i--) {
        if (Test-TunnelHealthy $candidates[$i]) {
            return $candidates[$i]
        }
    }
    if (Test-Path $TunnelUrlFile) {
        $fileUrl = (Get-Content $TunnelUrlFile -Raw).Trim().TrimEnd('/')
        if ($fileUrl -and (Test-TunnelHealthy $fileUrl)) {
            return $fileUrl
        }
    }
    return $null
}

try {
    if (-not (Test-Path $ConfigFile)) {
        Write-SyncLog "Skip: missing config $ConfigFile"
        exit 0
    }

    if (-not (Test-Path $TunnelUrlFile) -and -not (Test-Path "D:\Calvin\cloudflared\tunnel.log")) {
        Write-SyncLog "Skip: no tunnel-url.txt or tunnel.log"
        exit 0
    }

    $cfg = Read-EnvFile $ConfigFile
    $token = $cfg['VERCEL_TOKEN']
    $project = $cfg['VERCEL_PROJECT']
    $teamId = $cfg['VERCEL_TEAM_ID']

    if (-not $token -or -not $project) {
        throw "vercel-sync.env must set VERCEL_TOKEN and VERCEL_PROJECT"
    }

    $tunnelBase = Resolve-LiveTunnelUrl
    if (-not $tunnelBase) {
        throw "No healthy quick tunnel URL found (check cloudflared and tunnel.log)"
    }
    Set-Content -Path $TunnelUrlFile -Value $tunnelBase -Encoding UTF8
    Write-SyncLog "Live tunnel URL: $tunnelBase"

    $apiBase = "$tunnelBase/api"
    $lastSynced = if (Test-Path $LastSyncedFile) { (Get-Content $LastSyncedFile -Raw).Trim() } else { '' }

    if (-not $Force -and $lastSynced -eq $apiBase) {
        Write-SyncLog "Skip: VITE_API_BASE already synced ($apiBase)"
        exit 0
    }

    Write-SyncLog "Syncing VITE_API_BASE -> $apiBase"

    $query = @{}
    if ($teamId) { $query['teamId'] = $teamId }

    $envResponse = Invoke-VercelApi -Method GET -ResourcePath "/v9/projects/$project/env" -Token $token -Query $query
    $envList = if ($envResponse.envs) { @($envResponse.envs) } else { @($envResponse) }
    $existing = @($envList | Where-Object { $_.key -eq 'VITE_API_BASE' })

    foreach ($item in $existing) {
        Invoke-VercelApi -Method DELETE -ResourcePath "/v9/projects/$project/env/$($item.id)" -Token $token -Query $query | Out-Null
        Write-SyncLog "Removed old VITE_API_BASE env id $($item.id)"
    }

    Invoke-VercelApi -Method POST -ResourcePath "/v10/projects/$project/env" -Token $token -Query $query -Body @{
        key    = 'VITE_API_BASE'
        value  = $apiBase
        type   = 'encrypted'
        target = @('production', 'preview', 'development')
    } | Out-Null
    Write-SyncLog "Updated VITE_API_BASE on Vercel"

    $deployQuery = @{
        projectId = $project
        target    = 'production'
        limit     = '1'
    }
    if ($teamId) { $deployQuery['teamId'] = $teamId }

    $deployments = Invoke-VercelApi -Method GET -ResourcePath '/v6/deployments' -Token $token -Query $deployQuery

    $latest = @($deployments.deployments)[0]
    if (-not $latest) {
        throw "No production deployment found for project $project"
    }

    $deploymentId = if ($latest.uid) { $latest.uid } else { $latest.id }
    $redeployQuery = @{ forceNew = '1' }
    if ($teamId) { $redeployQuery['teamId'] = $teamId }

    $redeploy = Invoke-VercelApi -Method POST -ResourcePath '/v13/deployments' -Token $token -Query $redeployQuery -Body @{
        deploymentId = $deploymentId
        name         = $project
        target       = 'production'
    }
    $deployUrl = if ($redeploy.url) { $redeploy.url } else { $redeploy.alias[0] }
    $deployId = if ($redeploy.id) { $redeploy.id } else { $redeploy.uid }
    Write-SyncLog "Triggered redeploy: $deployUrl (id $deployId)"

    Set-Content -Path $LastSyncedFile -Value $apiBase -Encoding UTF8
    Write-SyncLog "Done."
    exit 0
} catch {
    Write-SyncLog "ERROR: $($_.Exception.Message)"
    exit 1
}
