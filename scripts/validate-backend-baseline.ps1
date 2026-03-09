[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$LogPath,

  [Parameter(Mandatory = $false)]
  [string]$BaselinePath = "docs/baselines/backend-production-baseline.json",

  [Parameter(Mandatory = $false)]
  [ValidateSet("allow", "warn", "fail")]
  [string]$FallbackPolicy
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
    [int]$Length = 160
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
    return [pscustomobject]@{
      Label = $Label
      Pass = $true
      Detail = "found at line $line"
      Snippet = Get-Snippet -Text $Text -Index $idx
    }
  }

  return [pscustomobject]@{
    Label = $Label
    Pass = $false
    Detail = "missing: $Needle"
    Snippet = "n/a"
  }
}

if (-not (Test-Path $LogPath)) {
  Write-Error "Log file not found: $LogPath"
}
if (-not (Test-Path $BaselinePath)) {
  Write-Error "Baseline JSON not found: $BaselinePath"
}

$logText = Get-Content -Raw -Path $LogPath
$baseline = Get-Content -Raw -Path $BaselinePath | ConvertFrom-Json

$effectivePolicy = if ($FallbackPolicy) { $FallbackPolicy } else { [string]$baseline.defaultFallbackPolicy }
if (-not $effectivePolicy) { $effectivePolicy = "allow" }

$checks = @()
foreach ($signal in $baseline.requiredSignals) {
  $checks += Test-Contains -Text $logText -Needle ([string]$signal) -Label "required signal: $signal"
}

$fallbackNeedle = [string]$baseline.optionalSignals.arbModelFallback
$fallbackIdx = if ($fallbackNeedle) { $logText.IndexOf($fallbackNeedle, [System.StringComparison]::Ordinal) } else { -1 }
$fallbackSeen = $fallbackIdx -ge 0

$fallbackCheckPass = $true
$fallbackDetail = "not present"
if ($fallbackSeen) {
  $line = Get-LineNumberFromIndex -Text $logText -Index $fallbackIdx
  $fallbackDetail = "present at line $line"
  if ($effectivePolicy -eq "fail") {
    $fallbackCheckPass = $false
  }
}

$checks += [pscustomobject]@{
  Label = "arb model fallback policy ($effectivePolicy)"
  Pass = $fallbackCheckPass
  Detail = $fallbackDetail
  Snippet = if ($fallbackSeen) { Get-Snippet -Text $logText -Index $fallbackIdx } else { "n/a" }
}

$failures = $checks | Where-Object { -not $_.Pass }

Write-Host "Backend baseline validation results"
Write-Host "- LogPath: $LogPath"
Write-Host "- BaselinePath: $BaselinePath"
Write-Host "- FallbackPolicy: $effectivePolicy"
Write-Host ""

foreach ($check in $checks) {
  $status = if ($check.Pass) { "PASS" } else { "FAIL" }
  Write-Host ("[{0}] {1} -> {2}" -f $status, $check.Label, $check.Detail)
}

if ($fallbackSeen -and $effectivePolicy -eq "warn") {
  Write-Host ""
  Write-Host "[WARN] Arb model fallback present (policy=warn)."
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
  Write-Host ("BACKEND_BASELINE_CHECK: FAIL ({0} failing checks)" -f $failures.Count)
  Write-Error "Backend baseline validation failed with $($failures.Count) failing check(s)."
}

Write-Host ""
Write-Host "Backend baseline validation passed."
Write-Host "BACKEND_BASELINE_CHECK: PASS"
exit 0
