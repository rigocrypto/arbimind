#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Post-deploy verification gate for Sepolia reduced-monitoring baseline.
    Run after Railway reports the bot service as Active.

.PARAMETER StabilizationWait
    Seconds to wait before fetching logs. Default: 60.

.PARAMETER RailwayService
    Railway service name to validate. Default: arbimind-bot.

.PARAMETER MinTicks
    Minimum healthy SCAN_TICKs required to pass. Default: 5.

.PARAMETER Lines
    Log lines to fetch from Railway CLI. Default: 300.

.EXAMPLE
    ./scripts/post-deploy-verify-sepolia.ps1
    ./scripts/post-deploy-verify-sepolia.ps1 -StabilizationWait 90 -MinTicks 8
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateRange(0, 3600)]
    [int]$StabilizationWait = 60,

    [Parameter(Mandatory = $false)]
    [string]$RailwayService = "arbimind-bot",

    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 500)]
    [int]$MinTicks = 5,

    [Parameter(Mandatory = $false)]
    [ValidateRange(20, 5000)]
    [int]$Lines = 300
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$validatorPath = Join-Path $scriptDir "validate-sepolia-baseline.ps1"
$pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
$shellExe = if ($pwshCmd) { "pwsh" } else { "powershell" }

if (-not (Test-Path $validatorPath)) {
    Write-Error "Validator script not found: $validatorPath"
}

Write-Host ""
Write-Host "================================================"
Write-Host " ArbiMind Post-Deploy Verification"
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
    # Run validator in a child PowerShell process so direct `exit` in validator
    # still returns control here and we can always print final gate status.
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
    Write-Host "Post-deploy verification PASSED." -ForegroundColor Green
} else {
    Write-Host "Post-deploy verification FAILED - review Railway logs before promoting." -ForegroundColor Red
}

exit $exitCode
