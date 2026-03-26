param(
    [Parameter(Mandatory = $false)]
    [ValidateSet('ci', 'bot-build-check', 'backend-build-check', 'ui-build-check', 'post-deploy-smoke', 'nightly-smoke', 'all')]
    [string]$Workflow = 'all',

    [Parameter(Mandatory = $false)]
    [int]$Days = 7,

    [Parameter(Mandatory = $false)]
    [switch]$ExportCsv,

    [Parameter(Mandatory = $false)]
    [string]$CsvPath = "ci-metrics-$(Get-Date -Format 'yyyy-MM-dd').csv"
)

$ErrorActionPreference = 'Stop'

$workflowFiles = @{
    'ci'                = 'ci.yml'
    'bot-build-check'   = 'bot-build-check.yml'
    'backend-build-check' = 'backend-build-check.yml'
    'ui-build-check'    = 'ui-build-check.yml'
    'post-deploy-smoke' = 'post-deploy-smoke.yml'
    'nightly-smoke'     = 'nightly-smoke.yml'
}

if ($Workflow -eq 'all') {
    $workflowsToAnalyze = $workflowFiles.Keys
}
else {
    $workflowsToAnalyze = @($Workflow)
}

$startDate = (Get-Date).AddDays(-$Days).ToString('yyyy-MM-dd')
$allMetrics = @()

Write-Host "CI Metrics Dashboard" -ForegroundColor Cyan
Write-Host "Analyzing workflows from the last $Days days`n" -ForegroundColor Cyan

foreach ($wf in $workflowsToAnalyze) {
    $workflowFile = $workflowFiles[$wf]
    Write-Host "Analyzing workflow: $wf ($workflowFile)" -ForegroundColor Yellow

    $runsJson = gh run list --workflow=$workflowFile --created=">=$startDate" --json status,conclusion,createdAt,updatedAt,databaseId,headBranch,event --limit 100
    $runs = if ([string]::IsNullOrWhiteSpace($runsJson)) { @() } else { $runsJson | ConvertFrom-Json }

    if (-not $runs -or $runs.Count -eq 0) {
        Write-Host "  No runs found in range.`n" -ForegroundColor DarkYellow
        continue
    }

    $completedRuns = $runs | Where-Object { $_.status -eq 'completed' }
    $successRuns = $completedRuns | Where-Object { $_.conclusion -eq 'success' }
    $failedRuns = $completedRuns | Where-Object { $_.conclusion -eq 'failure' }
    $cancelledRuns = $completedRuns | Where-Object { $_.conclusion -eq 'cancelled' }

    $durations = foreach ($run in $completedRuns) {
        $duration = (Get-Date $run.updatedAt) - (Get-Date $run.createdAt)
        $duration.TotalSeconds
    }

    $avgDuration = if ($durations) { ($durations | Measure-Object -Average).Average } else { 0 }
    $minDuration = if ($durations) { ($durations | Measure-Object -Minimum).Minimum } else { 0 }
    $maxDuration = if ($durations) { ($durations | Measure-Object -Maximum).Maximum } else { 0 }

    $totalRuns = $runs.Count
    $totalCompleted = $completedRuns.Count
    $successRate = if ($totalCompleted -gt 0) {
        [math]::Round(($successRuns.Count / $totalCompleted) * 100, 1)
    }
    else {
        0
    }
    $cancelRate = if ($totalRuns -gt 0) {
        [math]::Round(($cancelledRuns.Count / $totalRuns) * 100, 1)
    }
    else {
        0
    }

    Write-Host "  Total runs: $totalRuns (success: $($successRuns.Count), failed: $($failedRuns.Count), cancelled: $($cancelledRuns.Count))"
    Write-Host "  Success rate: $successRate%"
    Write-Host "  Avg duration: $([math]::Round($avgDuration, 0))s (min: $([math]::Round($minDuration, 0))s, max: $([math]::Round($maxDuration, 0))s)`n"

    $allMetrics += [PSCustomObject]@{
        Workflow         = $wf
        WorkflowFile     = $workflowFile
        TotalRuns        = $totalRuns
        Completed        = $totalCompleted
        Success          = $successRuns.Count
        Failed           = $failedRuns.Count
        Cancelled        = $cancelledRuns.Count
        SuccessRate      = $successRate
        CancellationRate = $cancelRate
        AvgDurationSec   = [math]::Round($avgDuration, 0)
        MinDurationSec   = [math]::Round($minDuration, 0)
        MaxDurationSec   = [math]::Round($maxDuration, 0)
        DateRange        = "$startDate to $(Get-Date -Format 'yyyy-MM-dd')"
    }
}

if ($allMetrics.Count -eq 0) {
    Write-Host "No metrics collected. Check workflow names, auth, or date range." -ForegroundColor Yellow
    exit 0
}

Write-Host "Summary" -ForegroundColor Cyan
$allMetrics | Format-Table -AutoSize

if ($ExportCsv) {
    $allMetrics | Export-Csv -Path $CsvPath -NoTypeInformation
    Write-Host "`nExported metrics to: $CsvPath" -ForegroundColor Green
}

$totalCancelled = ($allMetrics | Measure-Object -Property Cancelled -Sum).Sum
$totalRunsAll = ($allMetrics | Measure-Object -Property TotalRuns -Sum).Sum
$avgDurationAll = ($allMetrics | Measure-Object -Property AvgDurationSec -Average).Average
$estimatedMinutesSaved = if ($totalCancelled -gt 0 -and $avgDurationAll) {
    [math]::Round(($totalCancelled * $avgDurationAll) / 60, 1)
}
else {
    0
}

Write-Host "`nOptimization Insights" -ForegroundColor Cyan
Write-Host "  Cancelled runs: $totalCancelled"
Write-Host "  Estimated runner minutes saved: $estimatedMinutesSaved"

$lowSuccess = $allMetrics | Where-Object { $_.Completed -gt 0 -and $_.SuccessRate -lt 80 }
if ($lowSuccess) {
    Write-Host "`nWorkflows with success rate below 80%" -ForegroundColor Yellow
    $lowSuccess | Format-Table Workflow, SuccessRate, Failed -AutoSize
}

Write-Host "`nDone." -ForegroundColor Green
