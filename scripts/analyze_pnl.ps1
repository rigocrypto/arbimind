param([string]$LogFile = "soak_logs.txt")

$entries = Get-Content $LogFile |
  Where-Object { $_ -match '"swap_realized"' } |
  ForEach-Object {
    # Extract JSON payload from structured log line
    $json = $_ -replace '^.*?(\{.*\})\s*$', '$1'
    try { $json | ConvertFrom-Json } catch { $null }
  } |
  Where-Object { $_ -ne $null }

$total      = $entries.Count
if ($total -eq 0) {
  Write-Host "=== REALIZED PnL SUMMARY ==="
  Write-Host "No swap_realized events found in $LogFile"
  exit 0
}

$withPnl    = $entries | Where-Object { $_.realizedPnlUsd -ne $null }
$profitable = ($withPnl | Where-Object { $_.profitable -eq $true }).Count
$totalPnl   = ($withPnl | Measure-Object -Property realizedPnlUsd -Sum).Sum
$avgPnl     = if ($withPnl.Count -gt 0) { $totalPnl / $withPnl.Count } else { 0 }
$avgSlip    = ($entries | Where-Object { $_.realizedSlippageBps -ne $null } | Measure-Object -Property realizedSlippageBps -Average).Average

Write-Host "=== REALIZED PnL SUMMARY ==="
Write-Host "Total confirmed swaps : $total"
Write-Host "With pricing data     : $($withPnl.Count)"
Write-Host "Profitable            : $profitable ($([math]::Round($profitable/[math]::Max($withPnl.Count,1)*100,1))%)"
Write-Host "Total realized PnL    : `$$([math]::Round($totalPnl,4))"
Write-Host "Avg PnL per swap      : `$$([math]::Round($avgPnl,4))"
Write-Host "Avg realized slippage : $([math]::Round($avgSlip,1)) bps"
Write-Host ""

$entries | Group-Object venue | ForEach-Object {
  $v = $_.Name
  $vGroup = $_.Group | Where-Object { $_.realizedPnlUsd -ne $null }
  $vPnl = ($vGroup | Measure-Object -Property realizedPnlUsd -Sum).Sum
  $vCount = $_.Count
  $vWin = ($vGroup | Where-Object { $_.profitable -eq $true }).Count
  Write-Host "  $v : $vCount swaps, PnL=`$$([math]::Round($vPnl,4)), WR=$([math]::Round($vWin/[math]::Max($vCount,1)*100,1))%"
}

Write-Host ""
Write-Host "=== GO/NO-GO GATE ==="
$profitRate = if ($withPnl.Count -gt 0) { $profitable / $withPnl.Count * 100 } else { 0 }
$avgPnlPositive = $avgPnl -gt 0
$maxConsecLosses = 0
$curConsec = 0
foreach ($e in ($withPnl | Sort-Object { $_.signature })) {
  if ($e.profitable -eq $false) { $curConsec++ } else { $curConsec = 0 }
  if ($curConsec -gt $maxConsecLosses) { $maxConsecLosses = $curConsec }
}
$slippageOk = ($entries | Where-Object { $_.slippageWithinBounds -eq $false }).Count -eq 0

$checks = @(
  @{ Name = "Profitable rate >= 60%"; Pass = $profitRate -ge 60; Value = "$([math]::Round($profitRate,1))%" },
  @{ Name = "Avg realized PnL > 0"; Pass = $avgPnlPositive; Value = "`$$([math]::Round($avgPnl,6))" },
  @{ Name = "No venue 3+ consec losses"; Pass = $maxConsecLosses -lt 3; Value = "max=$maxConsecLosses" },
  @{ Name = "Slippage within 2x bounds"; Pass = $slippageOk; Value = $(if ($slippageOk) { "OK" } else { "FAIL" }) }
)

$allPass = $true
foreach ($c in $checks) {
  $icon = if ($c.Pass) { "[PASS]" } else { "[FAIL]"; $allPass = $false }
  Write-Host "  $icon $($c.Name) ($($c.Value))"
}

Write-Host ""
if ($total -lt 10) {
  Write-Host "VERDICT: INSUFFICIENT DATA ($total swaps, need 10+)"
} elseif ($allPass) {
  Write-Host "VERDICT: GO — safe to scale"
} else {
  Write-Host "VERDICT: NO-GO — fix failing checks before scaling"
}
