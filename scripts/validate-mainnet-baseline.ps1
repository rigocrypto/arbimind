[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$LogPath,

  [Parameter(Mandatory = $false)]
  [string]$BaselinePath = "docs/baselines/mainnet-baseline.json",

  [Parameter(Mandatory = $false)]
  [int]$MinTicks = 5,

  [Parameter(Mandatory = $false)]
  [switch]$IgnoreFirstTick,

  [Parameter(Mandatory = $false)]
  [switch]$FromRailway,

  [Parameter(Mandatory = $false)]
  [string]$RailwayService = "arbimind-bot",

  [Parameter(Mandatory = $false)]
  [ValidateRange(50, 5000)]
  [int]$Lines = 500,

  [Parameter(Mandatory = $false)]
  [switch]$SkipWalletBalanceCheck
)

$ErrorActionPreference = "Stop"

function Get-LineNumberFromIndex {
  param([string]$Text, [int]$Index)
  if ($Index -lt 0) { return -1 }
  return ([regex]::Matches($Text.Substring(0, $Index), "`n").Count + 1)
}

function Get-Snippet {
  param([string]$Text, [int]$Index, [int]$Length = 160)
  if ($Index -lt 0) { return "n/a" }
  $safeLength = [Math]::Min($Length, $Text.Length - $Index)
  return $Text.Substring($Index, $safeLength).Replace("`r", " ").Replace("`n", " ")
}

function New-Check {
  param([string]$Label, [bool]$Pass, [string]$Detail, [string]$Snippet = "n/a")
  return [pscustomobject]@{ Label = $Label; Pass = $Pass; Detail = $Detail; Snippet = $Snippet }
}

function Test-Contains {
  param([string]$Text, [string]$Needle, [string]$Label)
  $idx = $Text.IndexOf($Needle, [System.StringComparison]::Ordinal)
  if ($idx -ge 0) {
    $line = Get-LineNumberFromIndex -Text $Text -Index $idx
    $snippet = Get-Snippet -Text $Text -Index $idx
    return New-Check -Label $Label -Pass $true -Detail "found at line $line" -Snippet $snippet
  }
  return New-Check -Label $Label -Pass $false -Detail "missing: $Needle"
}

function Test-Regex {
  param([string]$Text, [string]$Pattern, [string]$Label)
  $match = [regex]::Match($Text, $Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($match.Success) {
    $line = Get-LineNumberFromIndex -Text $Text -Index $match.Index
    $snippet = Get-Snippet -Text $Text -Index $match.Index
    return New-Check -Label $Label -Pass $true -Detail "matched at line $line" -Snippet $snippet
  }
  return New-Check -Label $Label -Pass $false -Detail "pattern not found: $Pattern"
}

function Get-WalletAddressFromLogs {
  param([string]$Text)
  $walletLoaded = [regex]::Match($Text, "Wallet loaded:\s*(0x[a-fA-F0-9]{40})")
  if ($walletLoaded.Success) { return $walletLoaded.Groups[1].Value }

  $identity = [regex]::Match($Text, "Identity:.*?\((0x[a-fA-F0-9]{40})\)")
  if ($identity.Success) { return $identity.Groups[1].Value }

  return ""
}

function Get-WalletBalanceEth {
  param([string]$RpcUrl, [string]$Address)

  $body = @{
    jsonrpc = "2.0"
    method = "eth_getBalance"
    params = @($Address, "latest")
    id = 1
  } | ConvertTo-Json -Compress

  $resp = Invoke-RestMethod -Uri $RpcUrl -Method Post -ContentType "application/json" -Body $body -TimeoutSec 15
  if (-not $resp.result) {
    throw "eth_getBalance returned no result"
  }

  $hex = [string]$resp.result
  $wei = [System.Numerics.BigInteger]::Parse($hex.Substring(2), [System.Globalization.NumberStyles]::HexNumber)
  $eth = [double]$wei / 1e18
  return $eth
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
if (-not $PSBoundParameters.ContainsKey("MinTicks")) {
  $MinTicks = [int]$baseline.minTicks
}

$checks = @()
$checks += Test-Regex -Text $logText -Pattern "chainId\s*[=:]\s*1|chainId\s*[:=]\s*'?1'?" -Label "chain id is mainnet"
$checks += Test-Regex -Text $logText -Pattern 'mode\s*=\s*LIVE|mode:\s*''LIVE''|mode:\s*"LIVE"' -Label "mode is LIVE"
$checks += Test-Contains -Text $logText -Needle "v3Enabled: true" -Label "v3 enabled"

$v2Router = [string]$baseline.addresses.v2Router
$v3Quoter = [string]$baseline.addresses.v3Quoter
if ($v2Router) { $checks += Test-Contains -Text $logText -Needle $v2Router -Label "expected v2 router present" }
if ($v3Quoter) { $checks += Test-Contains -Text $logText -Needle $v3Quoter -Label "expected v3 quoter present" }

$requiredDexes = @($baseline.requiredDexes)
foreach ($dex in $requiredDexes) {
  $dexEscaped = [regex]::Escape([string]$dex)
  $dexPattern = '\[QUOTE\].*?"dex"\s*:\s*"{0}"' -f $dexEscaped
  $checks += Test-Regex -Text $logText -Pattern $dexPattern -Label "quotes present for $dex"
}

$tickMatches = [regex]::Matches($logText, "\[SCAN_TICK\]\s*\{(.*?)\}", [System.Text.RegularExpressions.RegexOptions]::Singleline)
$tickStartIndex = 0
if ($IgnoreFirstTick.IsPresent -and $tickMatches.Count -gt 0) {
  $tickStartIndex = 1
}

$minPairsChecked = [int]$baseline.minPairsChecked
$minQuotesOk = [int]$baseline.minQuotesOk
$maxQuotesFailed = [int]$baseline.maxQuotesFailed
$maxScanIntervalMs = [int]$baseline.maxScanIntervalMs

$healthyTicks = 0
$anyQuotesFailed = $false
$missingOpportunitiesField = 0
$tickTimes = New-Object System.Collections.Generic.List[DateTimeOffset]

for ($i = $tickStartIndex; $i -lt $tickMatches.Count; $i++) {
  $body = $tickMatches[$i].Groups[1].Value

  $pairsChecked = [regex]::Match($body, "pairsChecked:\s*(\d+)")
  $quotesOk = [regex]::Match($body, "quotesOk:\s*(\d+)")
  $quotesFailed = [regex]::Match($body, "quotesFailed:\s*(\d+)")
  $hasOpportunities = [regex]::Match($body, "opportunitiesFound:\s*(\d+)")
  $tsMatch = [regex]::Match($body, 'ts:\s*''([^'']+)''|ts:\s*"([^"]+)"')

  if (-not $pairsChecked.Success -or -not $quotesOk.Success -or -not $quotesFailed.Success) {
    continue
  }

  $pairsCheckedVal = [int]$pairsChecked.Groups[1].Value
  $quotesOkVal = [int]$quotesOk.Groups[1].Value
  $quotesFailedVal = [int]$quotesFailed.Groups[1].Value

  if (-not $hasOpportunities.Success) {
    $missingOpportunitiesField++
  }

  if ($quotesFailedVal -gt 0) {
    $anyQuotesFailed = $true
  }

  if ($tsMatch.Success) {
    $tsRaw = if ($tsMatch.Groups[1].Success) { $tsMatch.Groups[1].Value } else { $tsMatch.Groups[2].Value }
    try {
      $tickTimes.Add([DateTimeOffset]::Parse($tsRaw))
    } catch {
      # Ignore malformed timestamp values for interval math.
    }
  }

  if ($pairsCheckedVal -ge $minPairsChecked -and $quotesOkVal -ge $minQuotesOk -and $quotesFailedVal -le $maxQuotesFailed) {
    $healthyTicks++
  }
}

$checks += New-Check -Label "healthy scan ticks" -Pass ($healthyTicks -ge $MinTicks) -Detail "healthy=$healthyTicks required=$MinTicks"
$quotesFailedDetail = if ($anyQuotesFailed) { "found one or more ticks with quotesFailed > 0" } else { "none" }
$checks += New-Check -Label "ticks with quotesFailed > 0" -Pass (-not $anyQuotesFailed) -Detail $quotesFailedDetail
$opportunitiesDetail = if ($missingOpportunitiesField -eq 0) { "present on all parsed ticks" } else { "missing on $missingOpportunitiesField parsed ticks" }
$checks += New-Check -Label "opportunities field tracked" -Pass ($missingOpportunitiesField -eq 0) -Detail $opportunitiesDetail

if ($tickTimes.Count -ge 2) {
  $intervals = New-Object System.Collections.Generic.List[double]
  for ($i = 1; $i -lt $tickTimes.Count; $i++) {
    $intervalMs = ($tickTimes[$i] - $tickTimes[$i - 1]).TotalMilliseconds
    if ($intervalMs -gt 0) {
      $intervals.Add($intervalMs)
    }
  }

  if ($intervals.Count -gt 0) {
    $avgInterval = [Math]::Round(($intervals | Measure-Object -Average).Average, 2)
    $checks += New-Check -Label "scan interval average" -Pass ($avgInterval -le $maxScanIntervalMs) -Detail "average=${avgInterval}ms max=${maxScanIntervalMs}ms"
  } else {
    $checks += New-Check -Label "scan interval average" -Pass $false -Detail "unable to compute from parsed tick timestamps"
  }
} else {
  $checks += New-Check -Label "scan interval average" -Pass $false -Detail "insufficient tick timestamps for interval calculation"
}

$priceRangeMin = [double]$baseline.ethPriceSanityRange.min
$priceRangeMax = [double]$baseline.ethPriceSanityRange.max
$priceMatches = [regex]::Matches($logText, "\[QUOTE_RESULT\].*?(?:v2|v3):\s*(\d{1,6}(?:\.\d+)?)", [System.Text.RegularExpressions.RegexOptions]::Singleline)
$priceValues = @()
foreach ($pm in $priceMatches) {
  if ($pm.Success -and $pm.Groups[1].Success) {
    $priceValues += [double]$pm.Groups[1].Value
  }
}

if ($priceValues.Count -eq 0) {
  $checks += New-Check -Label "ETH price sanity" -Pass $false -Detail "no numeric v2/v3 prices found in QUOTE_RESULT lines"
} else {
  $outOfRange = $priceValues | Where-Object { $_ -lt $priceRangeMin -or $_ -gt $priceRangeMax }
  if ($outOfRange.Count -gt 0) {
    $checks += New-Check -Label "ETH price sanity" -Pass $false -Detail "out-of-range prices found: $($outOfRange -join ', ')"
  } else {
    $samplePrice = [Math]::Round(($priceValues | Measure-Object -Average).Average, 4)
    $checks += New-Check -Label "ETH price sanity" -Pass $true -Detail "all sampled prices within [$priceRangeMin, $priceRangeMax], avg=$samplePrice"
  }
}

if ($SkipWalletBalanceCheck.IsPresent) {
  $checks += New-Check -Label "wallet balance" -Pass $true -Detail "skipped via -SkipWalletBalanceCheck"
} else {
  $walletAddress = Get-WalletAddressFromLogs -Text $logText
  if ([string]::IsNullOrWhiteSpace($walletAddress)) {
    $checks += New-Check -Label "wallet balance" -Pass $false -Detail "wallet address not found in logs"
  } else {
    $rpcUrl = ("$($env:ETHEREUM_RPC_URL)").Trim()
    if ([string]::IsNullOrWhiteSpace($rpcUrl)) {
      $checks += New-Check -Label "wallet balance" -Pass $false -Detail "ETHEREUM_RPC_URL is not set in validator environment"
    } else {
      try {
        $balanceEth = Get-WalletBalanceEth -RpcUrl $rpcUrl -Address $walletAddress
        $minBalanceEth = [double]$baseline.minWalletBalanceEth
        $checks += New-Check -Label "wallet balance" -Pass ($balanceEth -ge $minBalanceEth) -Detail "balance=$([Math]::Round($balanceEth, 6)) ETH min=$minBalanceEth ETH"
      } catch {
        $checks += New-Check -Label "wallet balance" -Pass $false -Detail "RPC balance check failed: $($_.Exception.Message)"
      }
    }
  }
}

$failures = @($checks | Where-Object { -not ([bool]$_.Pass) })

Write-Host "Mainnet baseline validation results"
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

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Failure details:"
  foreach ($failure in $failures) {
    Write-Host ("- {0}" -f $failure.Label)
    Write-Host ("  expected: {0}" -f $failure.Detail)
    Write-Host ("  snippet: {0}" -f $failure.Snippet)
  }
  Write-Host ""
  Write-Host ("BASELINE_CHECK: FAIL ({0} failing checks)" -f $failures.Count) -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Mainnet baseline validation passed."
Write-Host "BASELINE_CHECK: PASS"
exit 0
