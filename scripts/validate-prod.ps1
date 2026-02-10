<#
.SYNOPSIS
  Smoke-test ArbiMind production backend endpoints.
.DESCRIPTION
  Run after deploy to verify health, snapshots, admin, and optionally UI CSP + portfolio.
  Usage: .\scripts\validate-prod.ps1 -BackendBase "https://YOUR-RAILWAY" -AdminKey "YOUR_ADMIN_KEY"
  With UI:  -UiBase "https://YOUR-VERCEL.vercel.app"
  With portfolio: -EvmAddress "0x..." -SolanaAddress "base58..."
#>
param(
  [Parameter(Mandatory = $true)][string]$BackendBase,  # e.g. https://arbimind-production.up.railway.app
  [Parameter(Mandatory = $true)][string]$AdminKey,
  [string]$UiBase,         # optional: e.g. https://arbimind.vercel.app
  [string]$EvmAddress,     # optional: test portfolio/timeseries
  [string]$SolanaAddress   # optional: test portfolio/timeseries
)

$api = "$BackendBase/api"

Write-Host "Health..."
Invoke-RestMethod -Uri "$api/health" -Method Get | ConvertTo-Json

Write-Host "`nSnapshots health (EVM)..."
Invoke-RestMethod -Uri "$api/snapshots/health?chain=evm" -Method Get | ConvertTo-Json

Write-Host "`nSnapshots health (Solana)..."
Invoke-RestMethod -Uri "$api/snapshots/health?chain=solana" -Method Get | ConvertTo-Json

Write-Host "`nAdmin last-run (EVM)..."
$adminHeaders = @{ "X-ADMIN-KEY" = $AdminKey }
Invoke-RestMethod -Uri "$api/admin/snapshots/last-run?chain=evm" -Method Get -Headers $adminHeaders | ConvertTo-Json

Write-Host "`nAdmin last-run (Solana)..."
Invoke-RestMethod -Uri "$api/admin/snapshots/last-run?chain=solana" -Method Get -Headers $adminHeaders | ConvertTo-Json

if ($UiBase) {
  Write-Host "`nUI CSP check..."
  $resp = Invoke-WebRequest -Uri $UiBase -Method GET -UseBasicParsing
  $csp = $resp.Headers["Content-Security-Policy"]

  if (-not $csp) {
    Write-Warning "Missing Content-Security-Policy header on UI response."
  } else {
    $backendOrigin = ([uri]$BackendBase).GetLeftPart([System.UriPartial]::Authority)
    if ($csp -match 'connect-src\s+([^;]+)') {
      $connectSrc = $Matches[1]
      if ($connectSrc -notmatch [regex]::Escape($backendOrigin)) {
        Write-Warning "CSP connect-src does not include backend origin: $backendOrigin"
      } else {
        Write-Host "CSP connect-src includes backend origin OK."
      }
    } else {
      if ($csp -notmatch [regex]::Escape($backendOrigin)) {
        Write-Warning "No connect-src directive or backend origin missing: $backendOrigin"
      } else {
        Write-Host "CSP includes backend origin (connect-src not parsed)."
      }
    }
  }
}

if ($EvmAddress -and $EvmAddress -match '^0x[a-fA-F0-9]{40}$') {
  Write-Host "`nPortfolio EVM summary..."
  Invoke-RestMethod -Uri "$api/portfolio/evm?address=$EvmAddress" -Method Get | ConvertTo-Json -Depth 3
  Write-Host "`nPortfolio EVM timeseries..."
  $ts = Invoke-RestMethod -Uri "$api/portfolio/evm/timeseries?address=$EvmAddress&range=30d" -Method Get
  Write-Host "method: $($ts.method)"
  if ($ts.method -ne "snapshotted_daily_equity") {
    Write-Warning "EVM timeseries still estimated (cron may not have run yet)"
  }
  $ts | ConvertTo-Json -Depth 2
}

# Base58: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz (no 0/O/I/l)
$base58Regex = '^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32,44}$'
if ($SolanaAddress -and $SolanaAddress -match $base58Regex) {
  Write-Host "`nPortfolio Solana summary..."
  Invoke-RestMethod -Uri "$api/portfolio/solana?address=$SolanaAddress" -Method Get | ConvertTo-Json -Depth 3
  Write-Host "`nPortfolio Solana timeseries..."
  $ts = Invoke-RestMethod -Uri "$api/portfolio/solana/timeseries?address=$SolanaAddress&range=30d" -Method Get
  Write-Host "method: $($ts.method)"
  if ($ts.method -ne "snapshotted_daily_equity") {
    Write-Warning "Solana timeseries still estimated (cron may not have run yet)"
  }
  $ts | ConvertTo-Json -Depth 2
}

Write-Host "`nDone."
