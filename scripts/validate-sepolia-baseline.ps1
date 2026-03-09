[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$LogPath,

  [Parameter(Mandatory = $false)]
  [string]$BaselinePath = "docs/baselines/sepolia-reduced-monitoring-baseline.json",

  [Parameter(Mandatory = $false)]
  [int]$MinTicks = 3,

  [Parameter(Mandatory = $false)]
  [switch]$IgnoreFirstTick,

  [Parameter(Mandatory = $false)]
  [switch]$FromRailway,

  [Parameter(Mandatory = $false)]
  [string]$RailwayService = "arbimind-bot",

  [Parameter(Mandatory = $false)]
  [ValidateRange(20, 5000)]
  [int]$Lines = 200
)

$ErrorActionPreference = "Stop"

function Get-LineNumberFromIndex {
  param(
    [string]$Text,
    [int]$Index
  )

  if ($Index -lt 0) { return -1 }
  return ([regex]::Matches($Text.Substring(0, $Index), "`n").Count + 1)
}

function Get-Snippet {
  param(
    [string]$Text,
    [int]$Index,
    [int]$Length = 140
  )

  if ($Index -lt 0) { return "n/a" }
  $safeLength = [Math]::Min($Length, $Text.Length - $Index)
  return $Text.Substring($Index, $safeLength).Replace("`r", " ").Replace("`n", " ")
}

function Test-Contains {
  param(
    [string]$Text,
    [string]$Needle,
    [string]$Label
  )

  $idx = $Text.IndexOf($Needle, [System.StringComparison]::Ordinal)
  if ($idx -ge 0) {
    $line = Get-LineNumberFromIndex -Text $Text -Index $idx
    $snippet = Get-Snippet -Text $Text -Index $idx
    return [pscustomobject]@{ Label = $Label; Pass = $true; Detail = "found at line $line"; Snippet = $snippet }
  }

  return [pscustomobject]@{ Label = $Label; Pass = $false; Detail = "missing: $Needle"; Snippet = "n/a" }
}

function Test-Regex {
  param(
    [string]$Text,
    [string]$Pattern,
    [string]$Label
  )

  $match = [regex]::Match($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) {
    $line = Get-LineNumberFromIndex -Text $Text -Index $match.Index
    $snippet = Get-Snippet -Text $Text -Index $match.Index
    return [pscustomobject]@{ Label = $Label; Pass = $true; Detail = "matched at line $line"; Snippet = $snippet }
  }

  return [pscustomobject]@{ Label = $Label; Pass = $false; Detail = "pattern not found: $Pattern"; Snippet = "n/a" }
}

if (-not $FromRailway.IsPresent -and [string]::IsNullOrWhiteSpace($LogPath)) {
  Write-Error "Provide -LogPath or use -FromRailway."
}

if (-not (Test-Path $BaselinePath)) {
  Write-Error "Baseline JSON not found: $BaselinePath"
}

$logText = ""
if ($FromRailway.IsPresent) {
  $railwayCmd = Get-Command railway -ErrorAction SilentlyContinue
  if (-not $railwayCmd) {
    Write-Error "Railway CLI not found. Install with: npm install -g @railway/cli"
  }

  try {
    Write-Host "Fetching logs from Railway service '$RailwayService' (lines=$Lines)..."
    $logText = (& railway logs --service $RailwayService --lines $Lines 2>&1 | Out-String)
  } catch {
    Write-Error "Failed to fetch logs from Railway CLI: $($_.Exception.Message)"
  }

  if ([string]::IsNullOrWhiteSpace($logText)) {
    Write-Error "Railway CLI returned empty logs for service '$RailwayService'."
  }
} else {
  if (-not (Test-Path $LogPath)) {
    Write-Error "Log file not found: $LogPath"
  }
  $logText = Get-Content -Raw -Path $LogPath
}

$baseline = Get-Content -Raw -Path $BaselinePath | ConvertFrom-Json

$checks = @()
$checks += Test-Contains -Text $logText -Needle "[PRICE_SERVICE_INIT]" -Label "price service init present"
$checks += Test-Contains -Text $logText -Needle "[EFFECTIVE_PAIRS]" -Label "effective pairs present"
$checks += Test-Contains -Text $logText -Needle "[SCANNER_INIT]" -Label "scanner init present"

$scanPairs = [string]$baseline.requiredEnv.SCAN_PAIRS
$v2Router = [string]$baseline.requiredEnv.SEPOLIA_UNISWAP_V2_ROUTER

if ($scanPairs) {
  $scanPairsEscaped = [regex]::Escape($scanPairs)
  $checks += Test-Regex -Text $logText -Pattern "scanPairsEnv:\s*'$scanPairsEscaped'|pairs:\s*\[\s*'$scanPairsEscaped'\s*\]" -Label "scan pair env applied"
}
if ($v2Router) {
  $checks += Test-Contains -Text $logText -Needle $v2Router -Label "expected v2 router present"
}
$checks += Test-Contains -Text $logText -Needle "v3Enabled: false" -Label "v3 disabled"

# In live Railway mode, sampled lines may not include startup logs.
# Treat boot-signature misses as soft checks and enforce steady-state ticks.
$softChecks = @()
if ($FromRailway.IsPresent) {
  $bootCheckLabels = @(
    "price service init present",
    "effective pairs present",
    "scanner init present",
    "scan pair env applied",
    "expected v2 router present",
    "v3 disabled"
  )

  foreach ($check in $checks) {
    if (-not $check.Pass -and $bootCheckLabels -contains $check.Label) {
      $softChecks += [pscustomobject]@{
        Label = $check.Label
        Detail = $check.Detail
      }
      $check.Pass = $true
      $check.Detail = "soft-check in Railway mode (startup signatures may be outside sampled lines)"
      $check.Snippet = "n/a"
    }
  }
}

# Parse SCAN_TICK blocks and count healthy ticks.
$tickMatches = [regex]::Matches($logText, "\[SCAN_TICK\]\s*\{(.*?)\}", [System.Text.RegularExpressions.RegexOptions]::Singleline)
$healthyTicks = 0
$tickStartIndex = 0
if ($IgnoreFirstTick.IsPresent -and $tickMatches.Count -gt 0) {
  $tickStartIndex = 1
}

for ($i = $tickStartIndex; $i -lt $tickMatches.Count; $i++) {
  $match = $tickMatches[$i]
  $body = $match.Groups[1].Value
  $pairsChecked = [regex]::Match($body, "pairsChecked:\s*(\d+)")
  $quotesOk = [regex]::Match($body, "quotesOk:\s*(\d+)")
  $quotesFailed = [regex]::Match($body, "quotesFailed:\s*(\d+)")

  if (-not $pairsChecked.Success -or -not $quotesOk.Success -or -not $quotesFailed.Success) {
    continue
  }

  $pairsCheckedVal = [int]$pairsChecked.Groups[1].Value
  $quotesOkVal = [int]$quotesOk.Groups[1].Value
  $quotesFailedVal = [int]$quotesFailed.Groups[1].Value

  if ($pairsCheckedVal -eq 1 -and $quotesOkVal -ge 1 -and $quotesFailedVal -eq 0) {
    $healthyTicks++
  }
}

$checks += [pscustomobject]@{
  Label = "healthy scan ticks"
  Pass = ($healthyTicks -ge $MinTicks)
  Detail = "healthy=$healthyTicks required=$MinTicks ignoreFirstTick=$($IgnoreFirstTick.IsPresent)"
  Snippet = "n/a"
}

$failures = $checks | Where-Object { -not $_.Pass }

Write-Host "Sepolia baseline validation results"
if ($FromRailway.IsPresent) {
  Write-Host "- Source: Railway CLI"
  Write-Host "- RailwayService: $RailwayService"
  Write-Host "- Lines: $Lines"
} else {
  Write-Host "- LogPath: $LogPath"
}
Write-Host "- BaselinePath: $BaselinePath"
Write-Host "- SCAN_TICK blocks: $($tickMatches.Count)"
if ($IgnoreFirstTick.IsPresent) {
  Write-Host "- first SCAN_TICK ignored: true"
}
Write-Host ""

foreach ($check in $checks) {
  $status = if ($check.Pass) { "PASS" } else { "FAIL" }
  Write-Host ("[{0}] {1} -> {2}" -f $status, $check.Label, $check.Detail)
}

if ($softChecks.Count -gt 0) {
  Write-Host ""
  Write-Host "Soft checks (Railway sampled-window):"
  foreach ($soft in $softChecks) {
    Write-Host ("[WARN] {0} -> {1}" -f $soft.Label, $soft.Detail)
  }
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Failure details:"
  foreach ($failure in $failures) {
    Write-Host ("- {0}" -f $failure.Label)
    Write-Host ("  expected: {0}" -f $failure.Detail)
    Write-Host ("  snippet: {0}" -f $failure.Snippet)
  }
  Write-Host ""
  Write-Host ("BASELINE_CHECK: FAIL ({0} failing checks)" -f $failures.Count)
  Write-Error "Baseline validation failed with $($failures.Count) failing check(s)."
}

Write-Host ""
Write-Host "Baseline validation passed."
Write-Host "BASELINE_CHECK: PASS"
exit 0
