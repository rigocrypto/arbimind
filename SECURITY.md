# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.1.x   | :white_check_mark: |
| 5.0.x   | :x:                |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

Use this section to tell people how to report a vulnerability.

Tell them where to go, how often they can expect to get an update on a
reported vulnerability, what to expect if the vulnerability is accepted or
declined, etc.

## Known Accepted Risks

### `elliptic` - v6.6.1 (as of 2026-03-27)

| Field | Detail |
| ------- | ------- |
| Package | `elliptic` |
| Current version | `6.6.1` |
| Advisory type | Review-only advisory |
| Upgrade path | None available at this time |
| Exposure | Transitive dependency; not imported directly in application code |
| Mitigation | Monitor upstream for a patched release and upgrade when available |
| Dependabot ref | Alert #56 |
| Review cadence | Re-evaluate monthly or on the next Dependabot notification |

Action required if:
- a patched `elliptic` release is published
- the dependency chain changes and `elliptic` can be removed
- the advisory is upgraded in severity
