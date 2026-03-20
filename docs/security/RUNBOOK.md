# Security Runbook

This runbook captures security-related operational policy and incident-safe workflows.

## Dependency PR Policy

- Major framework upgrades (for example Next/React major versions) must be handled as dedicated migration PRs and not bundled into routine dependency bumps.
- Large dev-dependency lockfile churn (roughly more than 500 lines of lockfile diff) must be split into smaller PRs that each go green independently.
