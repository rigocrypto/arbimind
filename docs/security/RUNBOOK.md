# Security Runbook

This runbook defines the minimum security operations process for ArbiMind.

## Scope

- GitHub Code Scanning (CodeQL)
- Secret scanning (Gitleaks workflow)
- Branch protection policy on main
- Dependency hygiene (Dependabot)

## Where To Monitor

- Code scanning alerts:
  - GitHub -> Security -> Code scanning alerts
- Workflow status:
  - GitHub -> Actions
- Pull request required checks:
  - CI / test
  - CodeQL Analysis / Analyze (javascript-typescript)

## Triage SLA

- Critical / High:
  - Initial triage in 24-48 hours
  - If valid, remediate immediately or isolate with compensating controls
- Medium / Low:
  - Weekly backlog grooming
  - Batch low-risk fixes when possible

## Alert Handling Workflow

1. Confirm alert details:
   - Rule ID
   - File and line
   - Reachability / exploitability in this codebase
2. Decide disposition:
   - True positive: fix in code
   - False positive: document rationale, dismiss with evidence
3. Open issue and link remediation PR(s)
4. Merge fix to main after required checks/review
5. Verify alert auto-closes on next CodeQL ingest

## False Positive Policy

When dismissing an alert:

- Add clear dismissal reason
- Include technical evidence in issue/PR comments
- Reference commit or design constraint proving non-exploitability
- Revisit if architecture changes

## Emergency Merge/Baseline Recovery

Emergency-only process if no reviewer is available and production security fix is blocked:

1. Apply temporary, minimal ruleset relaxation
2. Merge only the scoped security PR(s)
3. Immediately restore the original strict ruleset
4. Post an audit comment with:
   - Why emergency path was required
   - Exact duration of relaxation
   - Confirmation of restoration

## Baseline Guardrails

- Keep branch protection on main enabled:
  - 1 approval required
  - Required checks enforced
- Keep CodeQL and Gitleaks workflows active
- Keep Dependabot enabled and review dependency PRs weekly

## Operational Commands

### List open CodeQL alerts by severity

```powershell
gh api "/repos/rigocrypto/arbimind/code-scanning/alerts?tool_name=CodeQL&state=open&per_page=100" `
  --jq 'group_by(.rule.security_severity_level) | map({severity: (.[0].rule.security_severity_level // "unknown"), count: length})'
```

### Check active branch rulesets

```powershell
gh api /repos/rigocrypto/arbimind/rulesets
```

### Check PR status checks

```powershell
gh pr checks <PR_NUMBER> --repo rigocrypto/arbimind
```

## Ownership

- Repo owner/maintainer: accountable for policy and emergency actions
- Contributors: accountable for fixing alerts introduced by their changes

## Dependency PR Policy

- Major framework upgrades (for example Next/React major versions) must be handled as dedicated migration PRs and not bundled into routine dependency bumps.
- Large dev-dependency lockfile churn (roughly more than 500 lines of lockfile diff) must be split into smaller PRs that each go green independently.

