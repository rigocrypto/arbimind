#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Post-deploy verification gate for mainnet LIVE baseline.

.PARAMETER StabilizationWait
    Seconds to wait before fetching logs. Default: 90.

.PARAMETER RailwayService
    Railway service name to validate. Default: arbimind-bot.

.PARAMETER MinTicks
    Minimum healthy SCAN_TICKs required to pass. Default: 10.

.PARAMETER Lines
    Log lines to fetch from Railway CLI. Default: 500.

.EXAMPLE
    ./scripts/post-deploy-verify-mainnet.ps1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateRange(0, 3600)]
    [int]$StabilizationWait = 90,

    [Parameter(Mandatory = $false)]
    [string]$RailwayService = "arbimind-bot",

    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 500)]
    [int]$MinTicks = 10,

    [Parameter(Mandatory = $false)]
    [ValidateRange(50, 5000)]
    [int]$Lines = 500
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$validatorPath = Join-Path $scriptDir "validate-mainnet-baseline.ps1"
$pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
$shellExe = if ($pwshCmd) { "pwsh" } else { "powershell" }

if (-not (Test-Path $validatorPath)) {
    Write-Error "Validator script not found: $validatorPath"
}

Write-Host ""
Write-Host "================================================"
Write-Host " ArbiMind Mainnet Post-Deploy Verification"
Write-Host " Service : $RailwayService"
Write-Host " Wait    : ${StabilizationWait}s"
Write-Host " MinTicks: $MinTicks"
Write-Host " Lines   : $Lines"
Write-Host "================================================"
Write-Host ""

Write-Host "Waiting ${StabilizationWait}s for service to stabilize..."
for ($i = $StabilizationWait; $i -gt 0; $i--) {
    Write-Host -NoNewline "`r  $i seconds remaining...   "
    Start-Sleep -Seconds 1
}
Write-Host "`r  Stabilization wait complete.          "
Write-Host ""

$exitCode = 1
try {
    & $shellExe -NoProfile -ExecutionPolicy Bypass -File $validatorPath `
        -FromRailway `
        -RailwayService $RailwayService `
        -Lines $Lines `
        -MinTicks $MinTicks

    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
} catch {
    Write-Host "Validator execution error: $($_.Exception.Message)" -ForegroundColor Red
    $exitCode = 1
}

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "Mainnet post-deploy verification PASSED." -ForegroundColor Green
} else {
    Write-Host "Mainnet post-deploy verification FAILED - do not enable LIVE execution." -ForegroundColor Red
}

exit $exitCode
