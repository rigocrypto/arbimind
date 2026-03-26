# CodeQL Branch Protection Settings

Use these GitHub settings to enforce security quality on `main`.

## Required Status Checks

In repository settings:
1. Go to `Settings` -> `Branches`.
2. Edit the branch protection rule for `main` (or create one if missing).
3. Enable `Require status checks to pass before merging`.
4. Add this required check:
   - `Analyze (javascript-typescript)`

## Recommended Additional Protection

- Enable `Require branches to be up to date before merging`.
- Enable `Require pull request reviews before merging`.
- Enable `Dismiss stale pull request approvals when new commits are pushed`.
- Enable `Require conversation resolution before merging`.

## Triage Policy (Issue #18)

- High/Critical alerts: block merge until fixed or risk-accepted with explicit sign-off.
- Moderate alerts: must have a linked remediation issue before merge.
- Low alerts: can be deferred to security backlog with owner and due date.

## Alert Ownership

- Primary owner: backend/bot maintainers.
- Escalation SLA:
  - Critical: same day
  - High: 48 hours
  - Moderate: 7 days
  - Low: next sprint planning
