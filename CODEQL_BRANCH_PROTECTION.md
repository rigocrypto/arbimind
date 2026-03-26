# Branch Protection — `main`

This document records the active branch governance policy for `main` and the CodeQL checks that back it.

---

## Active Ruleset

| Field | Value |
|---|---|
| **Ruleset name** | `main-branch-protection` |
| **Ruleset ID** | `14114853` |
| **Target** | Default branch (`~DEFAULT_BRANCH`) |
| **Enforcement** | `active` |
| **Bypass actors** | None |
| **Settings UI** | https://github.com/rigocrypto/arbimind/rules/14114853 |

---

## Enforced Rules

### 1. Pull Request review

| Parameter | Value |
|---|---|
| Required approving reviews | **1** |
| Dismiss stale reviews on push | `true` |
| Require code-owner review | `false` |
| Require last-push approval | `false` |
| Resolve all threads | `false` |

### 2. Required status checks

Both contexts must pass before a PR can merge:

| Context string (exact) | Workflow | Job |
|---|---|---|
| `CI / test` | `CI` | `test` |
| `CodeQL Analysis / Analyze (javascript-typescript)` | `CodeQL Analysis` | `Analyze (javascript-typescript)` |

> **Note:** `strict_required_status_checks_policy` is `false` — PRs do not need to be up-to-date with `main` before merging.

---

## Check Name Verification

To verify the exact context strings currently running on `main`:

```powershell
gh api graphql `
  -f query='query($owner:String!,$name:String!,$expr:String!){ repository(owner:$owner,name:$name){ object(expression:$expr){ ... on Commit { checkSuites(first:50){ nodes { workflowRun { workflow { name } } checkRuns(first:20){ nodes { name status conclusion } } } } } } } }' `
  -F owner=rigocrypto -F name=arbimind -F expr=main
```

Or via REST (check run names on latest main commit):

```powershell
gh api repos/rigocrypto/arbimind/commits/main/check-runs |
  ConvertFrom-Json | Select-Object -ExpandProperty check_runs |
  Select-Object name, conclusion
```

---

## Legacy CodeQL Check (standalone)

The GitHub Advanced Security app produces an additional standalone check named **`CodeQL`** (no workflow name). This check is **not** required by the ruleset because:

- It re-surfaces CodeQL findings as a gate, but its failure semantics differ from a workflow job context.
- Including it as a required check caused PRs to be permanently blocked when no new alerts were introduced (false-negative gate behavior observed during PR #31).
- It is still present and surfaced in PR checks for visibility, but is not a merge gate.

---

## Open High-Severity Findings

Tracked in issue **#32**. Six findings remain (no criticals). See:
https://github.com/rigocrypto/arbimind/issues/32

---

## History

| Date | Action |
|---|---|
| 2026-03-19 | CodeQL workflow added to repo (PR #30) |
| 2026-03-19 | Critical SSRF findings remediated (PR #31) |
| 2026-03-19 | `main-branch-protection` ruleset created (ID 14114853) |
| 2026-03-19 | High-severity findings tracked in issue #32 |
