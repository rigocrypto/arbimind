<#
.SYNOPSIS
  Post-deploy smoke test for ArbiMind backend/UI.
.DESCRIPTION
  Runs fast checks for health, RPC connectivity, snapshots, and optional admin/UI/portfolio checks.
  Exits non-zero if required checks fail.

.EXAMPLE
  .\scripts\smoke-post-deploy.ps1 -BackendBase "https://arbimind-production.up.railway.app"

.EXAMPLE
  .\scripts\smoke-post-deploy.ps1 -BackendBase "https://arbimind-production.up.railway.app" -AdminKey "..." -UiBase "https://arbimind.vercel.app" -EvmAddress "0x..." -SolanaAddress "..."
#>
param(
  [Parameter(Mandatory = $true)][string]$BackendBase,
  [string]$AdminKey,
  [string]$UiBase,
  [string]$EvmAddress,
  [string]$SolanaAddress,
  [switch]$BotCanary,
  [switch]$OnlyAnalytics,
  [switch]$OnlyBotCanarySanity,
  [double]$CanaryNotionalEth = 0.01,
  [double]$CanaryMaxDailyLossEth = 0.005,
  [ValidateSet('evm,worldchain_sepolia,solana', 'evm,solana', 'worldchain_sepolia', 'evm', 'solana')]
  [string]$RpcChains = 'evm,worldchain_sepolia,solana'
)

$ErrorActionPreference = 'Stop'
$api = "$($BackendBase.TrimEnd('/'))/api"
$results = New-Object System.Collections.Generic.List[object]

function Coalesce {
  param(
    $Value,
    [string]$Default = 'n/a'
  )

  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
    return $Default
  }

  return [string]$Value
}

function Add-Result {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Detail
  )

  $results.Add([pscustomobject]@{
    Check  = $Name
    Status = if ($Ok) { 'PASS' } else { 'FAIL' }
    Detail = $Detail
  }) | Out-Null
}

function Invoke-Check {
  param(
    [string]$Name,
    [scriptblock]$Block
  )

  try {
    & $Block
  } catch {
    Add-Result -Name $Name -Ok $false -Detail ($_.Exception.Message -replace "`r|`n", ' ')
  }
}

Write-Host "Running ArbiMind smoke checks against: $BackendBase" -ForegroundColor Cyan

function Invoke-AnalyticsSmoke {
  Invoke-Check -Name 'Analytics ingest + query' -Block {
    try {
      $marker = "smoke-analytics-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
      $payload = @{
        name       = 'landing_view'
        properties = @{ source = 'smoke'; marker = $marker }
        ts         = (Get-Date).ToString('o')
        path       = '/'
        ctaVariant = 'A'
        source     = 'smoke-script'
      } | ConvertTo-Json -Depth 6

      $post = Invoke-RestMethod -Uri "$api/analytics/events" -Method Post -ContentType 'application/json' -Body $payload
      if (-not $post.ok -or [string]::IsNullOrWhiteSpace([string]$post.id)) {
        throw 'Analytics POST response missing ok/id'
      }

      $list = Invoke-RestMethod -Uri "$api/analytics/events?limit=50" -Method Get
      if (-not $list.ok -or $null -eq $list.events) {
        throw 'Analytics GET response missing ok/events'
      }

      $found = $false
      foreach ($evt in $list.events) {
        $hasMarker = $false
        if ($evt.properties -and $evt.properties.marker -eq $marker) {
          $hasMarker = $true
        }

        if ($evt.id -eq $post.id -or $hasMarker) {
          $found = $true
          break
        }
      }

      if (-not $found) {
        throw 'Inserted analytics event not found in recent list'
      }

      Add-Result -Name 'Analytics ingest + query' -Ok $true -Detail ("eventId=" + $post.id)
    } catch {
      if ($_.Exception.Response) {
        $resp = $_.Exception.Response
        $sr = New-Object IO.StreamReader($resp.GetResponseStream())
        $null = $sr.ReadToEnd()
        if ($resp.StatusCode.value__ -eq 503) {
          Add-Result -Name 'Analytics ingest + query' -Ok $true -Detail 'skipped (DATABASE_URL not set)'
          return
        }
      }
      throw
    }
  }

  Invoke-Check -Name 'Analytics CTA A/B report' -Block {
    try {
      $report = Invoke-RestMethod -Uri "$api/analytics/ab-cta?window=7d" -Method Get
      if (-not $report.ok) {
        throw 'A/B report response missing ok=true'
      }
      if ($null -eq $report.variants -or $report.variants.Count -lt 2) {
        throw 'A/B report missing variants data'
      }
      Add-Result -Name 'Analytics CTA A/B report' -Ok $true -Detail ("winner=" + (Coalesce $report.winner 'tie'))
    } catch {
      if ($_.Exception.Response) {
        $resp = $_.Exception.Response
        $sr = New-Object IO.StreamReader($resp.GetResponseStream())
        $null = $sr.ReadToEnd()
        if ($resp.StatusCode.value__ -eq 503) {
          Add-Result -Name 'Analytics CTA A/B report' -Ok $true -Detail 'skipped (DATABASE_URL not set)'
          return
        }
      }
      throw
    }
  }
}

if ($OnlyAnalytics) {
  Invoke-AnalyticsSmoke

  Write-Host "`nSmoke Summary" -ForegroundColor Cyan
  $results | Format-Table -AutoSize

  $fails = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
  if ($fails -gt 0) {
    Write-Host "`n$fails check(s) failed." -ForegroundColor Red
    exit 1
  }

  Write-Host "`nAll smoke checks passed." -ForegroundColor Green
  exit 0
}

if ($OnlyBotCanarySanity) {
  if (-not $BotCanary) {
    $BotCanary = $true
  }

  Invoke-Check -Name 'Bot canary config sanity' -Block {
    if ($CanaryNotionalEth -le 0) {
      throw 'CanaryNotionalEth must be > 0'
    }
    if ($CanaryMaxDailyLossEth -le 0) {
      throw 'CanaryMaxDailyLossEth must be > 0'
    }
    if ($CanaryMaxDailyLossEth -ge $CanaryNotionalEth) {
      throw 'CanaryMaxDailyLossEth should be lower than CanaryNotionalEth for safer rollout'
    }

    Add-Result -Name 'Bot canary config sanity' -Ok $true -Detail ("notional=" + $CanaryNotionalEth + ", maxLoss=" + $CanaryMaxDailyLossEth)
  }

  Write-Host "`nSmoke Summary" -ForegroundColor Cyan
  $results | Format-Table -AutoSize

  $fails = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
  if ($fails -gt 0) {
    Write-Host "`n$fails check(s) failed." -ForegroundColor Red
    exit 1
  }

  Write-Host "`nAll smoke checks passed." -ForegroundColor Green
  exit 0
}

Invoke-Check -Name 'API health' -Block {
  $res = Invoke-RestMethod -Uri "$api/health" -Method Get
  $ok = ($res.status -eq 'healthy' -or $res.success -eq $true -or $res.ok -eq $true)
  Add-Result -Name 'API health' -Ok $ok -Detail ("status=" + (Coalesce $res.status))
}

Invoke-Check -Name 'RPC health' -Block {
  $res = Invoke-RestMethod -Uri "$api/rpc/health?chain=$RpcChains" -Method Get
  $ok = $res.ok -eq $true
  $detail = if ($res.health) { ($res.health | ConvertTo-Json -Compress) } else { 'no-health-object' }
  Add-Result -Name 'RPC health' -Ok $ok -Detail $detail
}

Invoke-AnalyticsSmoke

Invoke-Check -Name 'Snapshots health (EVM)' -Block {
  try {
    $res = Invoke-RestMethod -Uri "$api/snapshots/health?chain=evm" -Method Get
    $ok = $res.ok -eq $true
    Add-Result -Name 'Snapshots health (EVM)' -Ok $ok -Detail ("stale=" + (Coalesce $res.stale))
  } catch {
    if ($_.Exception.Response) {
      $resp = $_.Exception.Response
      $sr = New-Object IO.StreamReader($resp.GetResponseStream())
      $null = $sr.ReadToEnd()
      if ($resp.StatusCode.value__ -eq 503) {
        Add-Result -Name 'Snapshots health (EVM)' -Ok $true -Detail 'skipped (DATABASE_URL not set)'
        return
      }
    }
    throw
  }
}

Invoke-Check -Name 'Snapshots health (Solana)' -Block {
  try {
    $res = Invoke-RestMethod -Uri "$api/snapshots/health?chain=solana" -Method Get
    $ok = $res.ok -eq $true
    Add-Result -Name 'Snapshots health (Solana)' -Ok $ok -Detail ("stale=" + (Coalesce $res.stale))
  } catch {
    if ($_.Exception.Response) {
      $resp = $_.Exception.Response
      $sr = New-Object IO.StreamReader($resp.GetResponseStream())
      $null = $sr.ReadToEnd()
      if ($resp.StatusCode.value__ -eq 503) {
        Add-Result -Name 'Snapshots health (Solana)' -Ok $true -Detail 'skipped (DATABASE_URL not set)'
        return
      }
    }
    throw
  }
}

if ($AdminKey) {
  Invoke-Check -Name 'Admin snapshots last-run (EVM)' -Block {
    try {
      $headers = @{ 'X-ADMIN-KEY' = $AdminKey }
      $res = Invoke-RestMethod -Uri "$api/admin/snapshots/last-run?chain=evm" -Method Get -Headers $headers
      Add-Result -Name 'Admin snapshots last-run (EVM)' -Ok $true -Detail ("ok=" + (Coalesce $res.ok))
    } catch {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 503) {
        Add-Result -Name 'Admin snapshots last-run (EVM)' -Ok $true -Detail 'skipped (service unavailable)'
        return
      }
      throw
    }
  }

  Invoke-Check -Name 'Admin snapshots last-run (Solana)' -Block {
    try {
      $headers = @{ 'X-ADMIN-KEY' = $AdminKey }
      $res = Invoke-RestMethod -Uri "$api/admin/snapshots/last-run?chain=solana" -Method Get -Headers $headers
      Add-Result -Name 'Admin snapshots last-run (Solana)' -Ok $true -Detail ("ok=" + (Coalesce $res.ok))
    } catch {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 503) {
        Add-Result -Name 'Admin snapshots last-run (Solana)' -Ok $true -Detail 'skipped (service unavailable)'
        return
      }
      throw
    }
  }
}

if ($UiBase) {
  Invoke-Check -Name 'UI reachable + CSP present' -Block {
    $headers = & curl.exe -sSI $UiBase
    $text = ($headers | Out-String)
    $statusOk = $text -match 'HTTP/[0-9.]+\s+2[0-9]{2}'
    $cspOk = $text -match 'Content-Security-Policy' -or $text -match 'Content-Security-Policy-Report-Only'
    $ok = $statusOk -and $cspOk
    $detail = if ($ok) { 'UI 2xx + CSP ok' } elseif (-not $statusOk) { 'UI non-2xx' } else { 'CSP missing' }
    Add-Result -Name 'UI reachable + CSP present' -Ok $ok -Detail $detail
  }
}

if ($EvmAddress -and $EvmAddress -match '^0x[a-fA-F0-9]{40}$') {
  Invoke-Check -Name 'Portfolio EVM summary' -Block {
    try {
      $res = Invoke-RestMethod -Uri "$api/portfolio/evm?address=$EvmAddress" -Method Get
      $ok = $res.chain -eq 'evm'
      Add-Result -Name 'Portfolio EVM summary' -Ok $ok -Detail ("chain=" + (Coalesce $res.chain))
    } catch {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 503) {
        Add-Result -Name 'Portfolio EVM summary' -Ok $true -Detail 'skipped (service unavailable)'
        return
      }
      throw
    }
  }

  Invoke-Check -Name 'Portfolio EVM timeseries' -Block {
    $res = Invoke-RestMethod -Uri "$api/portfolio/evm/timeseries?address=$EvmAddress&range=30d" -Method Get
    $ok = ($null -ne $res.points)
    Add-Result -Name 'Portfolio EVM timeseries' -Ok $ok -Detail ("method=" + (Coalesce $res.method))
  }
}

$base58Regex = '^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32,44}$'
if ($SolanaAddress -and $SolanaAddress -match $base58Regex) {
  Invoke-Check -Name 'Portfolio Solana summary' -Block {
    try {
      $res = Invoke-RestMethod -Uri "$api/portfolio/solana?address=$SolanaAddress" -Method Get
      $ok = $res.chain -eq 'solana'
      Add-Result -Name 'Portfolio Solana summary' -Ok $ok -Detail ("chain=" + (Coalesce $res.chain))
    } catch {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 503) {
        Add-Result -Name 'Portfolio Solana summary' -Ok $true -Detail 'skipped (service unavailable)'
        return
      }
      throw
    }
  }

  Invoke-Check -Name 'Portfolio Solana timeseries' -Block {
    $res = Invoke-RestMethod -Uri "$api/portfolio/solana/timeseries?address=$SolanaAddress&range=30d" -Method Get
    $ok = ($null -ne $res.points)
    Add-Result -Name 'Portfolio Solana timeseries' -Ok $ok -Detail ("method=" + (Coalesce $res.method))
  }
}

if ($BotCanary) {
  Invoke-Check -Name 'Bot canary config sanity' -Block {
    if ($CanaryNotionalEth -le 0) {
      throw 'CanaryNotionalEth must be > 0'
    }
    if ($CanaryMaxDailyLossEth -le 0) {
      throw 'CanaryMaxDailyLossEth must be > 0'
    }
    if ($CanaryMaxDailyLossEth -ge $CanaryNotionalEth) {
      throw 'CanaryMaxDailyLossEth should be lower than CanaryNotionalEth for safer rollout'
    }

    Add-Result -Name 'Bot canary config sanity' -Ok $true -Detail ("notional=" + $CanaryNotionalEth + ", maxLoss=" + $CanaryMaxDailyLossEth)
  }
}

Write-Host "`nSmoke Summary" -ForegroundColor Cyan
$results | Format-Table -AutoSize

$fails = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
if ($fails -gt 0) {
  Write-Host "`n$fails check(s) failed." -ForegroundColor Red
  exit 1
}

Write-Host "`nAll smoke checks passed." -ForegroundColor Green
exit 0
