<#
.SYNOPSIS
  Waits for the backend to serve the deployed commit before post-deploy smoke runs.

.DESCRIPTION
  Post-deploy smoke proves the backend is healthy, not that it is running the
  commit being smoked. A healthy PREVIOUS deployment passes every check, so a
  skipped or lagging backend deploy produced no red signal anywhere. See #377.

  The gate verifies BACKEND freshness, not global repo freshness. Railway only
  rebuilds the backend when backend-relevant files change, so a workflow-, docs-,
  UI- or test-only commit legitimately leaves the previous backend SHA serving.
  Requiring an exact SHA match on every commit fails those runs for no reason.

  Rule:
    backend-relevant files changed between deployed and expected commit
      -> wait until /api/version reports the expected SHA
    no backend-relevant files changed
      -> the running backend is functionally current; proceed

  Comparing the RANGE rather than a single commit also handles accumulation: if
  several non-backend commits land in a row, the backend stays put and each run
  still passes, because nothing backend-relevant changed across the whole range.

.EXAMPLE
  ./scripts/wait-for-backend-version.ps1 -BackendBase "https://api.example.com" -ExpectedSha $env:GITHUB_SHA
#>
param(
  [Parameter(Mandatory = $true)][string]$BackendBase,
  [Parameter(Mandatory = $true)][string]$ExpectedSha,
  [int]$TimeoutMinutes = 10,
  [int]$DelaySeconds = 10,
  [int]$StabilitySeconds = 3,
  [int]$RequestTimeoutSeconds = 10,
  # Paths that affect the backend image. Deliberately excludes workflows, docs
  # and UI: those must not force a Railway backend deploy.
  [string[]]$BackendPath = @(
    'packages/backend',
    'Dockerfile.backend',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml'
  )
)

$ErrorActionPreference = 'Stop'

<#
  Pure decision function: given one or two /api/version payloads, decide whether
  the backend is serving the expected commit.

  Three conditions, not just the sha:
    sha match        - the expected commit is live
    uptimeSeconds    - proves the build includes #375; without it, startedAt is
                       recomputed per request and cannot verify deploy age
    stable startedAt - independently catches a restarting container, or a stale
                       build that reports the right sha
#>
function Test-BackendVersionReady {
  param(
    $Version,
    [string]$ExpectedSha,
    $SecondVersion
  )

  if ($null -eq $Version) {
    return [pscustomobject]@{ Ready = $false; Reason = 'unreachable' }
  }
  if ([string]::IsNullOrWhiteSpace($ExpectedSha)) {
    return [pscustomobject]@{ Ready = $false; Reason = 'no-expected-sha' }
  }
  if ($Version.sha -ne $ExpectedSha) {
    return [pscustomobject]@{ Ready = $false; Reason = 'sha-mismatch' }
  }
  if ($null -eq $Version.uptimeSeconds) {
    return [pscustomobject]@{ Ready = $false; Reason = 'missing-uptime' }
  }
  if ($null -eq $SecondVersion) {
    return [pscustomobject]@{ Ready = $false; Reason = 'needs-stability-check' }
  }
  if ($SecondVersion.startedAt -ne $Version.startedAt) {
    return [pscustomobject]@{ Ready = $false; Reason = 'unstable-startedAt' }
  }

  return [pscustomobject]@{ Ready = $true; Reason = 'ready' }
}

<#
  Files affecting the backend image that changed between two commits.

  Returns $null when the comparison cannot be made -- unknown SHA, shallow
  clone, or git failure -- which the caller must treat as "cannot prove the
  backend is current" and fall back to requiring an exact match. Returning an
  empty list there would wave through a genuinely stale backend.
#>
function Get-BackendRelevantChanges {
  param(
    [string]$FromSha,
    [string]$ToSha,
    [string[]]$Paths
  )

  # An unknown SHA makes git write to stderr. Under $ErrorActionPreference='Stop'
  # Windows PowerShell 5.1 promotes that to a terminating NativeCommandError even
  # though the exit code is what we actually want to inspect. Relax locally so the
  # exit-code checks below can do their job on both editions.
  $ErrorActionPreference = 'Continue'

  if ([string]::IsNullOrWhiteSpace($FromSha) -or [string]::IsNullOrWhiteSpace($ToSha)) { return $null }

  # NOTE: every array return below is prefixed with the unary comma. Without it
  # PowerShell unrolls an EMPTY array to nothing, the caller receives $null, and
  # "no backend changes" becomes indistinguishable from "diff unavailable" --
  # which flips the decision from "proceed" to "wait", the exact bug this fixes.
  if ($FromSha -eq $ToSha) { return ,@() }

  foreach ($sha in @($FromSha, $ToSha)) {
    & git cat-file -e "$sha^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
  }

  $out = & git diff --name-only "$FromSha" "$ToSha" -- $Paths 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }

  return ,@($out | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
}

<#
  Decides whether a backend deploy must be awaited.

  Deployed sha equal to expected            -> no wait
  Backend-relevant diff is empty            -> no wait, functionally current
  Backend-relevant diff non-empty           -> wait
  Diff not computable                       -> wait (fail safe)
#>
function Test-BackendDeployRequired {
  param(
    [string]$ObservedSha,
    [string]$ExpectedSha,
    $ChangedFiles
  )

  if ($ObservedSha -eq $ExpectedSha) {
    return [pscustomobject]@{ Required = $false; Reason = 'already-current' }
  }
  if ($null -eq $ChangedFiles) {
    return [pscustomobject]@{ Required = $true; Reason = 'diff-unavailable' }
  }
  if (@($ChangedFiles).Count -eq 0) {
    return [pscustomobject]@{ Required = $false; Reason = 'no-backend-changes' }
  }

  return [pscustomobject]@{ Required = $true; Reason = 'backend-changed' }
}

function Get-VersionGateTimeoutMessage {
  param(
    [string]$ExpectedSha,
    $Observed,
    [string]$BackendBase,
    $ChangedFiles
  )

  $obsSha = '(unreachable)'
  $obsStarted = '(unknown)'
  $obsUptime = '(unknown)'

  if ($null -ne $Observed) {
    if ($Observed.sha) { $obsSha = $Observed.sha }
    if ($Observed.startedAt) { $obsStarted = $Observed.startedAt }
    if ($null -ne $Observed.uptimeSeconds) { $obsUptime = $Observed.uptimeSeconds }
  }

  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add('Backend-relevant changes detected, but Railway did not serve the expected backend SHA before timeout.')
  $lines.Add('')
  $lines.Add("Expected backend sha:   $ExpectedSha")
  $lines.Add("Observed backend sha:   $obsSha")
  $lines.Add("Observed startedAt:     $obsStarted")
  $lines.Add("Observed uptimeSeconds: $obsUptime")
  $lines.Add("Backend URL:            $BackendBase")
  $lines.Add('')

  if ($null -eq $ChangedFiles) {
    $lines.Add('Backend-relevant changed files: (could not be determined - requiring exact match)')
  }
  else {
    $lines.Add('Backend-relevant changed files:')
    foreach ($f in @($ChangedFiles)) { $lines.Add("  $f") }
  }

  $lines.Add('')
  $lines.Add('Smoke was NOT run. Passing it against a stale backend would report the')
  $lines.Add('previous commit as verified. Check whether the Railway backend deploy')
  $lines.Add('was skipped, is still queued, or failed its check suite. See #377.')

  return ($lines -join "`n")
}

function Wait-BackendVersion {
  param(
    [string]$BackendBase,
    [string]$ExpectedSha,
    [int]$TimeoutMinutes,
    [int]$DelaySeconds,
    [int]$StabilitySeconds,
    [int]$RequestTimeoutSeconds,
    [string[]]$BackendPath
  )

  $backend = $BackendBase.TrimEnd('/')
  $versionUrl = "$backend/api/version"
  $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
  $attempt = 0
  $observed = $null
  $changed = $null

  Write-Host "Checking whether the backend must serve ${ExpectedSha}: $versionUrl"

  while ((Get-Date) -lt $deadline) {
    $attempt++
    $first = $null
    $second = $null

    try {
      $first = Invoke-RestMethod -Uri $versionUrl -Method Get -TimeoutSec $RequestTimeoutSeconds
      $observed = $first

      $pre = Test-BackendVersionReady -Version $first -ExpectedSha $ExpectedSha
      if ($pre.Reason -eq 'needs-stability-check') {
        Start-Sleep -Seconds $StabilitySeconds
        $second = Invoke-RestMethod -Uri $versionUrl -Method Get -TimeoutSec $RequestTimeoutSeconds
      }
    }
    catch {
      Write-Host "Attempt ${attempt}: /api/version unreachable - $($_.Exception.Message)"
      Start-Sleep -Seconds $DelaySeconds
      continue
    }

    $result = Test-BackendVersionReady -Version $first -ExpectedSha $ExpectedSha -SecondVersion $second
    if ($result.Ready) {
      Write-Host "Backend is serving the expected commit after attempt $attempt."
      Write-Host "  sha           = $($first.sha)"
      Write-Host "  startedAt     = $($first.startedAt)"
      Write-Host "  uptimeSeconds = $($second.uptimeSeconds)"
      return $true
    }

    # Only a sha mismatch can be excused by "the backend image did not change".
    # missing-uptime / unstable-startedAt indicate a stale or restarting build
    # and must still be waited out.
    if ($result.Reason -eq 'sha-mismatch') {
      $changed = Get-BackendRelevantChanges -FromSha $first.sha -ToSha $ExpectedSha -Paths $BackendPath
      $need = Test-BackendDeployRequired -ObservedSha $first.sha -ExpectedSha $ExpectedSha -ChangedFiles $changed

      if (-not $need.Required) {
        Write-Host "Backend is serving $($first.sha), expected $ExpectedSha."
        Write-Host "No backend-relevant files changed between them ($($need.Reason)), so the running backend is functionally current."
        Write-Host "Paths considered: $($BackendPath -join ', ')"
        return $true
      }

      $count = if ($null -eq $changed) { 'unknown' } else { @($changed).Count }
      Write-Host "Attempt ${attempt}: backend serving $($first.sha), expected $ExpectedSha (backend-relevant changes: $count, $($need.Reason))."
    }
    else {
      switch ($result.Reason) {
        'missing-uptime'     { Write-Host "Attempt ${attempt}: sha matches but uptimeSeconds is absent - build predates #375." }
        'unstable-startedAt' { Write-Host "Attempt ${attempt}: startedAt unstable ($($first.startedAt) vs $($second.startedAt))." }
        default              { Write-Host "Attempt ${attempt}: not ready ($($result.Reason))." }
      }
    }

    Start-Sleep -Seconds $DelaySeconds
  }

  throw (Get-VersionGateTimeoutMessage -ExpectedSha $ExpectedSha -Observed $observed -BackendBase $backend -ChangedFiles $changed)
}

# Only run when invoked as a script, so tests can dot-source for the functions.
if ($MyInvocation.InvocationName -ne '.') {
  $ok = Wait-BackendVersion `
    -BackendBase $BackendBase `
    -ExpectedSha $ExpectedSha `
    -TimeoutMinutes $TimeoutMinutes `
    -DelaySeconds $DelaySeconds `
    -StabilitySeconds $StabilitySeconds `
    -RequestTimeoutSeconds $RequestTimeoutSeconds `
    -BackendPath $BackendPath

  if (-not $ok) { exit 1 }
  exit 0
}
