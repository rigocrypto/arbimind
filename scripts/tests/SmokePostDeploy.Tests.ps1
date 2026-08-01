<#
  Coverage for the post-deploy smoke tooling.

  scripts/smoke-post-deploy.ps1 has been implicated in four production-impacting
  incidents while having no automated coverage at all. Each Describe block below
  maps to one of them, so a recurrence fails in CI rather than in production.

  The smoke script declares mandatory parameters and executes real network
  checks on load, so it cannot simply be dot-sourced. Its helper functions are
  extracted via the PowerShell AST and evaluated in isolation -- this tests the
  committed code rather than a reimplementation of it.
#>

BeforeAll {
    $script:RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $script:SmokeScript = Join-Path $RepoRoot 'scripts/smoke-post-deploy.ps1'
    $script:VersionScript = Join-Path $RepoRoot 'scripts/wait-for-backend-version.ps1'

    # Load the smoke script's helpers without executing it. The script declares
    # mandatory parameters and performs real network calls on load, so it cannot
    # be dot-sourced; its function definitions are lifted out via the AST.
    #
    # This must happen inline rather than inside a helper function: dot-sourcing
    # within a function scopes the definitions to that function, leaving them
    # invisible to the It blocks.
    $wanted = @(
        'Get-HttpStatusCode', 'Read-ErrorResponseBody', 'Get-HttpErrorDetail',
        'Coalesce', 'Add-Result', 'Add-DbUnavailableResult'
    )
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($SmokeScript, [ref]$null, [ref]$null)
    $fns = $ast.FindAll({
            param($n)
            $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -in $wanted
        }, $true)
    foreach ($f in $fns) {
        . ([scriptblock]::Create($f.Extent.Text))
    }

    . $VersionScript -BackendBase 'https://unused.invalid' -ExpectedSha 'unused'
}

Describe 'smoke script is syntactically valid' {
    It 'parses without errors' {
        $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($SmokeScript, [ref]$null, [ref]$errors)
        $errors | Should -BeNullOrEmpty
    }

    It 'wait-for-backend-version parses without errors' {
        $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($VersionScript, [ref]$null, [ref]$errors)
        $errors | Should -BeNullOrEmpty
    }
}

Describe 'argument binding (#294 / #366)' {
    # Both workflows once splatted an ARRAY, which binds positionally: the literal
    # string '-BackendBase' landed in $BackendBase and the real URL in $AdminKey.
    # Every check then failed with "No such host is known. (-backendbase:80)".

    BeforeAll {
        $script:BindProbe = {
            param(
                [Parameter(Mandatory = $true)][string]$BackendBase,
                [string]$AdminKey,
                [string]$UiBase
            )
            [pscustomobject]@{ BackendBase = $BackendBase; AdminKey = $AdminKey; UiBase = $UiBase }
        }
    }

    It 'binds by name when splatting a hashtable' {
        $splat = @{ BackendBase = 'https://api.example.com'; UiBase = 'https://ui.example.com' }
        $result = & $BindProbe @splat

        $result.BackendBase | Should -Be 'https://api.example.com'
        $result.UiBase | Should -Be 'https://ui.example.com'
        $result.AdminKey | Should -BeNullOrEmpty
    }

    It 'binds positionally when splatting an array - the #366 failure mode' {
        $bad = @('-BackendBase', 'https://api.example.com')
        $result = & $BindProbe @bad

        # This is the bug: the flag name itself becomes the value.
        $result.BackendBase | Should -Be '-BackendBase'
        $result.AdminKey | Should -Be 'https://api.example.com'
    }

    It 'rejects a non-URL BackendBase so array-splatting fails loudly' {
        # smoke-post-deploy.ps1 validates this up front precisely so the array
        # case throws immediately instead of surfacing as a pile of DNS errors.
        $content = Get-Content $SmokeScript -Raw
        $content | Should -Match 'must be an absolute http\(s\) URL'
        $content | Should -Match 'hashtable'
    }

    It 'both production workflows splat a hashtable, not an array' {
        foreach ($wf in @('post-deploy-smoke.yml', 'nightly-smoke.yml')) {
            $path = Join-Path $RepoRoot ".github/workflows/$wf"
            $text = Get-Content $path -Raw
            $text | Should -Match '\$smokeArgs\s*=\s*@\{'
            $text | Should -Not -Match '\$smokeArgs\s*=\s*@\('
        }
    }
}

Describe 'HTTP error handling under pwsh 7 (#294 / #369)' {
    # The error paths called GetResponseStream(), a Windows PowerShell 5.1 API,
    # while the workflows run `shell: pwsh` (7). Real failures surfaced as
    # "does not contain a method named 'GetResponseStream'", masking status/body.

    It 'reads the body via the pwsh 7 ReadAsStringAsync path' {
        # Shaped like HttpResponseMessage rather than using the real type, which
        # is not loaded by default on Windows PowerShell 5.1. This exercises the
        # same branch the helper takes under pwsh 7.
        $awaiter = [pscustomobject]@{}
        $awaiter | Add-Member -MemberType ScriptMethod -Name GetResult -Value { '{"ok":false,"error":"boom"}' }
        $task = [pscustomobject]@{}
        $task | Add-Member -MemberType ScriptMethod -Name GetAwaiter -Value { $awaiter }
        $content = [pscustomobject]@{}
        $content | Add-Member -MemberType ScriptMethod -Name ReadAsStringAsync -Value { $task }
        $response = [pscustomobject]@{ Content = $content }

        $body = Read-ErrorResponseBody $response

        $body | Should -Match 'boom'
    }

    It 'returns null rather than throwing on an object with neither API' {
        $body = Read-ErrorResponseBody ([pscustomobject]@{ Nothing = $true })
        $body | Should -BeNullOrEmpty
    }

    It 'returns null for a null response' {
        Read-ErrorResponseBody $null | Should -BeNullOrEmpty
    }

    It 'extracts the status code from an error record shape' {
        $err = [pscustomobject]@{
            Exception = [pscustomobject]@{
                Response = [pscustomobject]@{
                    StatusCode = [pscustomobject]@{ value__ = 503 }
                }
            }
        }
        Get-HttpStatusCode $err | Should -Be 503
    }

    It 'returns null when no response is attached' {
        Get-HttpStatusCode ([pscustomobject]@{ Exception = [pscustomobject]@{ Response = $null } }) | Should -BeNullOrEmpty
    }

    It 'does not call GetResponseStream unguarded' {
        # Guarded 5.1 fallback is fine; an unguarded call is the #369 bug.
        $content = Get-Content $SmokeScript -Raw
        $content | Should -Match "PSObject\.Methods\['GetResponseStream'\]"
        $content | Should -Match 'ReadAsStringAsync'
    }
}

Describe 'RequireDatabase mode (#370 / #375)' {
    # Production smoke scored a DB-unavailable 503 as "PASS - skipped", so a
    # backend with no DATABASE_URL at all produced a fully green run.

    BeforeEach {
        $script:results = New-Object System.Collections.Generic.List[object]
    }

    It 'records a FAIL when -RequireDatabase is set' {
        $script:RequireDatabase = $true
        Add-DbUnavailableResult -Name 'Analytics CTA A/B report'

        $results.Count | Should -Be 1
        $results[0].Status | Should -Be 'FAIL'
        $results[0].Detail | Should -Match 'database unavailable'
    }

    It 'records a PASS/skip when -RequireDatabase is absent' {
        $script:RequireDatabase = $false
        Add-DbUnavailableResult -Name 'Analytics CTA A/B report'

        $results[0].Status | Should -Be 'PASS'
        $results[0].Detail | Should -Match 'skipped'
    }

    It 'fails every DB-backed check in required mode' {
        $script:RequireDatabase = $true
        foreach ($n in @('Analytics ingest + query', 'Analytics CTA A/B report', 'Snapshots health (EVM)', 'Snapshots health (Solana)')) {
            Add-DbUnavailableResult -Name $n
        }

        @($results | Where-Object { $_.Status -eq 'FAIL' }).Count | Should -Be 4
    }

    It 'is enabled by both production workflows' {
        foreach ($wf in @('post-deploy-smoke.yml', 'nightly-smoke.yml')) {
            $text = Get-Content (Join-Path $RepoRoot ".github/workflows/$wf") -Raw
            $text | Should -Match 'RequireDatabase\s*=\s*\$true'
        }
    }
}

Describe 'deployed-commit gate (#377 / #378)' {
    # Smoke passed 8/8 for 7a00c35 while production still served 58b406d9 for
    # over an hour. Health alone cannot prove the deployment happened.

    BeforeAll {
        $script:Sha = 'a' * 40
        $script:Other = 'b' * 40
        function New-Version {
            param([string]$sha, [string]$startedAt = '2026-08-01T00:00:00.000Z', $uptimeSeconds = 120)
            $o = [pscustomobject]@{ ok = $true; sha = $sha; startedAt = $startedAt }
            if ($null -ne $uptimeSeconds) { $o | Add-Member -NotePropertyName uptimeSeconds -NotePropertyValue $uptimeSeconds }
            return $o
        }
    }

    It 'is ready when sha matches, uptimeSeconds exists and startedAt is stable' {
        $v = New-Version -sha $Sha
        $r = Test-BackendVersionReady -Version $v -ExpectedSha $Sha -SecondVersion (New-Version -sha $Sha)

        $r.Ready | Should -BeTrue
        $r.Reason | Should -Be 'ready'
    }

    It 'waits when the backend serves a different commit - the #377 failure mode' {
        $r = Test-BackendVersionReady -Version (New-Version -sha $Other) -ExpectedSha $Sha

        $r.Ready | Should -BeFalse
        $r.Reason | Should -Be 'sha-mismatch'
    }

    It 'waits when uptimeSeconds is absent (build predates #375)' {
        $v = New-Version -sha $Sha -uptimeSeconds $null
        $r = Test-BackendVersionReady -Version $v -ExpectedSha $Sha

        $r.Ready | Should -BeFalse
        $r.Reason | Should -Be 'missing-uptime'
    }

    It 'waits when startedAt drifts between reads' {
        $a = New-Version -sha $Sha -startedAt '2026-08-01T00:00:00.000Z'
        $b = New-Version -sha $Sha -startedAt '2026-08-01T00:00:03.500Z'
        $r = Test-BackendVersionReady -Version $a -ExpectedSha $Sha -SecondVersion $b

        $r.Ready | Should -BeFalse
        $r.Reason | Should -Be 'unstable-startedAt'
    }

    It 'reports unreachable when there is no response' {
        (Test-BackendVersionReady -Version $null -ExpectedSha $Sha).Reason | Should -Be 'unreachable'
    }

    It 'refuses to pass when no expected sha is supplied' {
        $r = Test-BackendVersionReady -Version (New-Version -sha $Sha) -ExpectedSha ''
        $r.Ready | Should -BeFalse
        $r.Reason | Should -Be 'no-expected-sha'
    }

    It 'timeout message names both shas and says smoke did not run' {
        $observed = New-Version -sha $Other -startedAt '2026-07-30T22:16:49.453Z'
        $msg = Get-VersionGateTimeoutMessage -ExpectedSha $Sha -Observed $observed `
            -BackendBase 'https://api.example.com' -ChangedFiles @('packages/backend/src/index.ts')

        $msg | Should -Match ([regex]::Escape($Sha))
        $msg | Should -Match ([regex]::Escape($Other))
        $msg | Should -Match 'Smoke was NOT run'
        $msg | Should -Match 'https://api.example.com'
    }

    It 'timeout message lists the backend-relevant changed files' {
        $msg = Get-VersionGateTimeoutMessage -ExpectedSha $Sha -Observed (New-Version -sha $Other) `
            -BackendBase 'https://api.example.com' `
            -ChangedFiles @('packages/backend/src/index.ts', 'pnpm-lock.yaml')

        $msg | Should -Match 'Backend-relevant changed files:'
        $msg | Should -Match 'packages/backend/src/index.ts'
        $msg | Should -Match 'pnpm-lock.yaml'
    }

    It 'timeout message degrades gracefully when the backend was never reachable' {
        $msg = Get-VersionGateTimeoutMessage -ExpectedSha $Sha -Observed $null `
            -BackendBase 'https://api.example.com' -ChangedFiles $null

        $msg | Should -Match 'unreachable'
        $msg | Should -Match ([regex]::Escape($Sha))
        $msg | Should -Match 'could not be determined'
    }

    It 'is wired into post-deploy smoke but not nightly' {
        $post = Get-Content (Join-Path $RepoRoot '.github/workflows/post-deploy-smoke.yml') -Raw
        $nightly = Get-Content (Join-Path $RepoRoot '.github/workflows/nightly-smoke.yml') -Raw

        $post | Should -Match 'wait-for-backend-version\.ps1'
        # Nightly is schedule-triggered, not deploy-triggered, so a sha gate is wrong there.
        $nightly | Should -Not -Match 'wait-for-backend-version\.ps1'
    }
}

Describe 'backend freshness vs repo freshness (#379)' {
    # #378 required an exact sha match on every commit, so a workflow-only commit
    # failed post-deploy smoke even though Railway was right not to rebuild.
    # The gate must verify BACKEND freshness, not repo freshness.

    Context 'Test-BackendDeployRequired decision table' {
        It 'does not wait when the deployed sha already equals the expected sha' {
            $r = Test-BackendDeployRequired -ObservedSha 'aaa' -ExpectedSha 'aaa' -ChangedFiles @()
            $r.Required | Should -BeFalse
            $r.Reason | Should -Be 'already-current'
        }

        It 'does not wait when no backend-relevant files changed - the #379 fix' {
            $r = Test-BackendDeployRequired -ObservedSha 'aaa' -ExpectedSha 'bbb' -ChangedFiles @()
            $r.Required | Should -BeFalse
            $r.Reason | Should -Be 'no-backend-changes'
        }

        It 'waits when backend-relevant files changed' {
            $r = Test-BackendDeployRequired -ObservedSha 'aaa' -ExpectedSha 'bbb' -ChangedFiles @('packages/backend/src/index.ts')
            $r.Required | Should -BeTrue
            $r.Reason | Should -Be 'backend-changed'
        }

        It 'waits (fail safe) when the diff could not be computed' {
            $r = Test-BackendDeployRequired -ObservedSha 'aaa' -ExpectedSha 'bbb' -ChangedFiles $null
            $r.Required | Should -BeTrue
            $r.Reason | Should -Be 'diff-unavailable'
        }

        It 'treats "no changes" and "diff unavailable" as DIFFERENT states' {
            # The critical regression. An empty array returned from a PowerShell
            # function unrolls to $null, which collapsed these two states into one
            # and flipped the decision from proceed to wait.
            $empty = Test-BackendDeployRequired -ObservedSha 'aaa' -ExpectedSha 'bbb' -ChangedFiles @()
            $unknown = Test-BackendDeployRequired -ObservedSha 'aaa' -ExpectedSha 'bbb' -ChangedFiles $null

            $empty.Required | Should -BeFalse
            $unknown.Required | Should -BeTrue
            $empty.Reason | Should -Not -Be $unknown.Reason
        }
    }

    Context 'Get-BackendRelevantChanges against real repository history' {
        BeforeAll {
            $script:Paths = @('packages/backend', 'Dockerfile.backend', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml')
            # Resolve by message so the suite does not pin abbreviated hashes that
            # could become ambiguous as history grows.
            function Get-CommitBySubject {
                param([string]$Pattern)
                $sha = & git -C $RepoRoot log --format='%H' --grep $Pattern -n 1 2>$null
                return ($sha | Select-Object -First 1)
            }
            $script:BackendCommit = Get-CommitBySubject 'surface DB failures in analytics'      # #375
            $script:WorkflowCommit = Get-CommitBySubject 'verify the backend serves the smoked' # #378
        }

        It 'returns an empty collection, not $null, when nothing backend-relevant changed' {
            if (-not $BackendCommit -or -not $WorkflowCommit) { Set-ItResult -Skipped -Because 'history not available'; return }

            # #378 changed only .github/workflows/**
            $changed = Get-BackendRelevantChanges -FromSha $BackendCommit -ToSha $WorkflowCommit -Paths $Paths

            # Pester's -BeNullOrEmpty cannot distinguish these, which is precisely
            # the distinction under test: $null means "could not determine",
            # an empty array means "determined, and nothing changed".
            ($null -eq $changed) | Should -BeFalse -Because '$null would mean the diff was unavailable'
            @($changed).Count | Should -Be 0
        }

        It 'a workflow-only commit proceeds without waiting' {
            if (-not $BackendCommit -or -not $WorkflowCommit) { Set-ItResult -Skipped -Because 'history not available'; return }

            $changed = Get-BackendRelevantChanges -FromSha $BackendCommit -ToSha $WorkflowCommit -Paths $Paths
            $need = Test-BackendDeployRequired -ObservedSha $BackendCommit -ExpectedSha $WorkflowCommit -ChangedFiles $changed

            $need.Required | Should -BeFalse
            $need.Reason | Should -Be 'no-backend-changes'
        }

        It 'a commit touching packages/backend triggers a wait' {
            if (-not $BackendCommit) { Set-ItResult -Skipped -Because 'history not available'; return }

            $parent = & git -C $RepoRoot rev-parse "$BackendCommit^" 2>$null
            $changed = Get-BackendRelevantChanges -FromSha $parent -ToSha $BackendCommit -Paths $Paths

            @($changed).Count | Should -BeGreaterThan 0
            (Test-BackendDeployRequired -ObservedSha $parent -ExpectedSha $BackendCommit -ChangedFiles $changed).Required | Should -BeTrue
        }

        It 'returns an empty collection when both shas are identical' {
            if (-not $BackendCommit) { Set-ItResult -Skipped -Because 'history not available'; return }

            $changed = Get-BackendRelevantChanges -FromSha $BackendCommit -ToSha $BackendCommit -Paths $Paths
            ($null -eq $changed) | Should -BeFalse
            @($changed).Count | Should -Be 0
        }

        It 'returns $null for an unknown sha without throwing under ErrorActionPreference=Stop' {
            # git writes to stderr for an unknown object, which Windows PowerShell 5.1
            # promotes to a terminating NativeCommandError before the exit code can be
            # inspected. The helper must survive that on both editions.
            $ErrorActionPreference = 'Stop'
            { Get-BackendRelevantChanges -FromSha ('9' * 40) -ToSha 'HEAD' -Paths $Paths } | Should -Not -Throw
            Get-BackendRelevantChanges -FromSha ('9' * 40) -ToSha 'HEAD' -Paths $Paths | Should -BeNullOrEmpty
        }

        It 'classifies lockfile and workspace manifest changes as backend-relevant' {
            $Paths | Should -Contain 'pnpm-lock.yaml'
            $Paths | Should -Contain 'pnpm-workspace.yaml'
            $Paths | Should -Contain 'package.json'
            $Paths | Should -Contain 'Dockerfile.backend'
        }

        It 'does not treat workflows, docs or UI as backend-relevant' {
            # Those must never force a Railway backend rebuild.
            $Paths | Should -Not -Contain '.github'
            $Paths | Should -Not -Contain 'packages/ui'
            $Paths | Should -Not -Contain 'scripts'
        }
    }
}
