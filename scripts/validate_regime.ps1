#!/usr/bin/env pwsh
# validate_regime.ps1
# Run after 1 week of regime-logged data to decide whether to promote
# time features into dynamic execution policy.
#
# Input: regime_log.jsonl (one JSON entry per line, schema = RegimeLogEntry)
# Usage: .\validate_regime.ps1 -LogFile regime_log.jsonl

param(
    [string]$LogFile = "regime_log.jsonl"
)

if (-not (Test-Path $LogFile)) {
    Write-Error "Log file not found: $LogFile"
    exit 1
}

$entries = Get-Content $LogFile | ForEach-Object { $_ | ConvertFrom-Json }

$labels = @("overlap", "peak", "normal", "low")

Write-Host "`n=== REGIME VALIDATION REPORT ===" -ForegroundColor Cyan
Write-Host "Total entries: $($entries.Count)"
Write-Host ""

# Per-regime breakdown
foreach ($label in $labels) {
    $slice = $entries | Where-Object { $_.regimeLabel -eq $label }
    $attempted = $slice | Where-Object { $_.attempted -eq $true }
    $confirmed = $attempted | Where-Object { $_.confirmed -eq $true }
    $x1788 = $attempted | Where-Object { $_.errorCode -eq "0x1788" }

    $attemptCount = $attempted.Count
    $confirmCount = $confirmed.Count
    $confirmRate  = if ($attemptCount -gt 0) { [math]::Round($confirmCount / $attemptCount * 100, 1) } else { "n/a" }
    $x1788Rate    = if ($attemptCount -gt 0) { [math]::Round($x1788.Count / $attemptCount * 100, 1) } else { "n/a" }

    $avgPnl = if ($confirmed.Count -gt 0) {
        [math]::Round(($confirmed | Measure-Object -Property netPnlUsd -Average).Average, 4)
    } else { "n/a" }

    Write-Host "--- $($label.ToUpper()) ---" -ForegroundColor Yellow
    Write-Host ("  Scored     : {0}" -f $slice.Count)
    Write-Host ("  Attempted  : {0}" -f $attemptCount)
    Write-Host ("  Confirmed  : {0}  ({1}%)" -f $confirmCount, $confirmRate)
    Write-Host ("  0x1788 rate: {0}%" -f $x1788Rate)
    Write-Host ("  Avg PnL    : {0} USD" -f $avgPnl)
    Write-Host ""
}

# Weekend vs weekday
$weekday = $entries | Where-Object { $_.isWeekend -eq $false -and $_.attempted -eq $true }
$weekend = $entries | Where-Object { $_.isWeekend -eq $true  -and $_.attempted -eq $true }
$wdConf  = ($weekday | Where-Object { $_.confirmed }).Count
$weConf  = ($weekend | Where-Object { $_.confirmed }).Count

Write-Host "--- WEEKEND vs WEEKDAY ---" -ForegroundColor Yellow
Write-Host ("  Weekday attempts: {0}  confirms: {1}  rate: {2}%" -f $weekday.Count, $wdConf,
    $(if ($weekday.Count -gt 0) { [math]::Round($wdConf/$weekday.Count*100,1) } else { "n/a" }))
Write-Host ("  Weekend attempts: {0}  confirms: {1}  rate: {2}%" -f $weekend.Count, $weConf,
    $(if ($weekend.Count -gt 0) { [math]::Round($weConf/$weekend.Count*100,1) } else { "n/a" }))
Write-Host ""

# Hourly heatmap
Write-Host "--- HOURLY CONFIRMATION RATE ---" -ForegroundColor Yellow
Write-Host "  Hour | Attempts | Confirms | Rate"
0..23 | ForEach-Object {
    $h = $_
    $ha = $entries | Where-Object { $_.utcHour -eq $h -and $_.attempted -eq $true }
    $hc = $ha | Where-Object { $_.confirmed -eq $true }
    if ($ha.Count -gt 0) {
        $rate = [math]::Round($hc.Count / $ha.Count * 100, 1)
        $bar  = "#" * [math]::Min($hc.Count, 20)
        Write-Host ("  {0,4} | {1,8} | {2,8} | {3,5}%  {4}" -f $h, $ha.Count, $hc.Count, $rate, $bar)
    }
}

Write-Host ""
Write-Host "=== PROMOTION DECISION CRITERIA ===" -ForegroundColor Cyan
Write-Host "Promote regime features to dynamic policy if:"
Write-Host "  [ ] overlap/peak confirm rate > 2x low/normal confirm rate"
Write-Host "  [ ] 0x1788 rate is lower in peak/overlap than in low"
Write-Host "  [ ] >= 20 attempts per regime label (sufficient sample)"
Write-Host "  [ ] weekend confirm rate < weekday confirm rate"
Write-Host ""
Write-Host "If criteria not met after 1 week: keep features as logging only."
Write-Host "Do not promote policy adjustments on fewer than 20 attempts per bucket."
