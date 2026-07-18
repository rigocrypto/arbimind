# Dependency Security Maintenance Status - 2026-07-18

Dependency/security maintenance pass completed.

Merged:
- #347: smoke workflow timeout/retry stabilization
- #349: backend Mongoose parent-scoped dependency update

Current audit baseline on main:
- 2 low
- 9 moderate
- 0 high
- 0 critical

Release decision:
- Go for normal release cadence: YES
- Security maintenance fully complete: NO
- Reason: 9 moderate / 2 low remain, but no high/critical

Remaining moderate/low advisories are deferred because safe parent-scoped remediation is not currently available without major upgrades, broad overrides, or audit regression.

Future work:
- Investigate the bot-side natural -> mongoose -> mongodb -> socks -> ip-address path separately.
- Investigation only first, no edits.

Guardrails for follow-up:
- Do not apply leaf overrides for qs, uuid, brace-expansion, tar, socks, or ip-address.
- Keep #294 open until the next scheduled nightly smoke run confirms #347 resolved timeout/cancellation behavior.
- Keep #88 open as low-priority UI lint backlog.
