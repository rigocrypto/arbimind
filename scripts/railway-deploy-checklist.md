# Railway `arbimind` — Deploy Verification Checklist

Run this in one pass after every redeploy to confirm experiment state.

## Pre-deploy

| # | Check | Expected | Where |
|---|---|---|---|
| 1 | Branch | `feat/ui-live-ready-image` | Railway → Service → Settings → Source |
| 2 | Build type | **Fresh deploy** (not restart) | Triggered from latest commit — restart reuses stale image |
| 3 | Commit | `afdfca1` or later | Deploy log first line / build SHA |

## Environment variables

| # | Variable | Expected | Tab |
|---|---|---|---|
| 4 | `SOLANA_ALLOW_MULTIHOP` | `true` | Variables |
| 5 | `SOLANA_ONLY_DIRECT_ROUTES` | `false` | Variables |
| 6 | `SOLANA_LEGACY_TX` | `false` | Variables |
| 7 | `JUPITER_BASE_URL` | `https://lite-api.jup.ag/swap/v1` | Variables |

## Startup log (`[SOLANA] runtime notional`)

| # | Field | Expected |
|---|---|---|
| 8 | `allowMultihop` | `true` |
| 9 | `onlyDirectRoutes` | `false` |
| 10 | `asLegacyTransaction` | `false` |
| 11 | `riskDenyTiers` | `["critical"]` |
| 12 | `riskCanaryTiers` | `["high"]` |
| 13 | `riskCanaryMaxUsd` | `1` |
| 14 | `riskEdgeBumpBps` | `15` |

### Effective experiment state (sanity check)

If #8–14 all pass, this implies:

- [x] Multi-hop route discovery enabled
- [x] Multi-hop route execution enabled
- [x] Versioned (v0) transactions enabled
- [x] Working Jupiter quote base (lite-api v1)
- [x] Venue risk policy loaded

## Runtime log (first 2–3 scan cycles)

| # | Check | Expected | Look for |
|---|---|---|---|
| 15 | `[SOLANA_RISK]` log | Appears on every execution attempt | `venue`, `riskTier`, `action` |
| 16 | Multi-hop behavior | No local `rejectReason: "multi-hop route"` | Should see `swap attempt` on `routeLegs: 2+` |

## Stop gates

| Symptom | Diagnosis | Fix |
|---|---|---|
| `allowMultihop` absent or `false` in startup | EXP-017 not live | Confirm env var + **redeploy** (not restart) |
| `riskDenyTiers` / `riskCanaryTiers` absent | Commit `afdfca1` not deployed | Check branch/commit + redeploy |
| `allowMultihop: true` but logs show `multi-hop route (...)` rejection | Second rejection path or stale code | Search codebase for `"multi-hop route"` |
| 2+ leg routes reach `swap attempt` | EXP-017 is confirmed active | Proceed with log analysis |
| `[SOLANA_RISK]` never appears | Risk layer not wired | Verify commit includes Executor.ts changes |
