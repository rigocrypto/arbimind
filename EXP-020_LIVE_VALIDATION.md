# EXP-020 Live Validation Template

> **Purpose**: Structured go/no-go checklist for validating EXP-020 (fee-aware gating + session metrics) in production before enabling real capital.
> **Duration**: Run for **60–120 minutes** minimum before passing judgment.

---

## 1. Pre-Launch Checks

| # | Check | Command / Action | Status |
|---|-------|-----------------|--------|
| 1 | Bot starts without crash | `npm run dev:bot` — watch for startup logs | ☐ |
| 2 | Inventory snapshot logged | Look for `[INVENTORY] startup config` + first `[INVENTORY] snapshot` | ☐ |
| 3 | Rebalance loop started | Look for `[INVENTORY] starting rebalance loop` | ☐ |
| 4 | Session summary timer started | No explicit log for this — confirmed by first `[SESSION] periodic_summary` (after `summaryIntervalMs`) | ☐ |
| 5 | Executor speed-tier resolved | Look for `[SOLANA] speed_tier_resolved` with `tier`, `maxLamports`, `priorityLevel` | ☐ |
| 6 | Priority fee estimator active | Look for `[SOLANA] fee_estimate` with `source: 'helius'` (or `'static-config'` if Helius unavailable) | ☐ |

---

## 2. Execution Funnel Validation (per `[SESSION] periodic_summary`)

Wait for the first periodic summary (default: 10 min), then capture these fields:

| Field | Expected Range | Red Flag | Value |
|-------|---------------|----------|-------|
| `discovered` | > 0 after 10 min | 0 → scanner isn't finding opportunities | |
| `gateEvaluated` | ≤ `discovered` | > discovered → counter bug | |
| `gatePassed` | ≤ `gateEvaluated` | 0 with many evaluated → gates too tight | |
| `gateRejected` | 0–100% of evaluated | 100% sustained → review reject reasons | |
| `swapsBuilt` | ≥ `gatePassed` | < gatePassed → build failures | |
| `submitted` | ≤ `swapsBuilt` | 0 → submission never reached | |
| `confirmed` | > 0 eventually | 0 after 30+ trades → landing issue | |
| `expired` | < 20% of submitted | > 50% → fee too low or RPC lag | |
| `failed` | < 10% of submitted | > 30% → contract/slippage issue | |

### Reject Reason Breakdown

Capture from `reject_*` fields in the summary log:

| Reason Key | Meaning | Concern If |
|-----------|---------|-----------|
| `reject_net_edge_negative` | Fee exceeds gross profit | Dominant → fees too high for current spreads |
| `reject_low_landing_rate` | Landing rate below threshold | Frequent → RPC/fee calibration needed |
| `reject_profit_below_floor` | Net profit below `minNetEdgeUsd` | OK if frequent early — spreads narrow |
| `reject_accumulator_negative` | Trailing net-edge window negative | Protective circuit breaker, should be rare |

---

## 3. Fee & Economics Validation

### Per-Trade Logs

Capture from each `[SOLANA] execution fee` log:

| Field | Expected | Red Flag |
|-------|----------|----------|
| `feeLamports` | 10,000–500,000 | > 1M consistently → fee estimator miscalibrated |
| `executionFeeUsd` | $0.001–$0.05 (typical) | > $0.10 → high, review speed tier |
| `netExpectedAfterFeesUsd` | > 0 | < 0 → gate failed to block unprofitable trade |
| `solPriceUsd` | ~current SOL price | 0 → InventoryManager price feed broken |

### Session Summary Averages

| Field | Healthy Range | Red Flag |
|-------|--------------|----------|
| `avgFeeBpsOfNotional` | 5–100 bps | > 200 bps → fees eating too much notional |
| `avgNetEdgeBpsOfNotional` | > 0 bps | < 0 sustained → losing money after fees |
| `avgExpectedGrossUsd` | > 0 | Null → no confirmed trades with fee data |
| `avgExecutionFeeUsd` | $0.001–$0.05 | > $0.10 → review |
| `avgNetEdgeUsd` | > 0 | < 0 → systemic loss |

---

## 4. Quote Freshness

| Field | Healthy | Red Flag |
|-------|---------|----------|
| `avgQuoteAgeMs` | < 2000ms | > 5000ms → stale quotes, likely slippage |
| `minQuoteAgeMs` | < 500ms | N/A |
| `maxQuoteAgeMs` | < 10000ms | > 15000ms → some quotes extremely stale |

Also check per-submit log `[SOLANA] tx_submitted` for `quoteAgeMs` on individual trades.

---

## 5. Landing Rate

From `[SOLANA] landing_report` (logged periodically by LandingTracker):

| Field | Healthy | Red Flag |
|-------|---------|----------|
| `landingRate` | > 0.5 (50%) | < 0.3 → fee tier too low |
| `windowConfirmed` | > 0 | 0 after 10+ submits → serious issue |
| `windowExpired` | < 30% of submitted | > 50% → blockheight/timing issue |
| `consecutiveFailures` | 0–2 | > 5 → auto-escalation should kick in |

---

## 6. Rebalance Gate

Check `[INVENTORY] rebalance_gate` logs and session summary:

| Field | Expected | Red Flag |
|-------|----------|----------|
| `rebalanceEvaluated` | > 0 (if auto-fund on) | 0 after 60 min → rebalance loop not triggering |
| `rebalanceRejected` | < 50% of evaluated | 100% → `maxRebalanceCostBps` too tight |
| `costBps` in gate log | < 100 (default max) | Consistently near max → fees volatile |

---

## 7. Go / No-Go Decision Matrix

After **60 minutes of observation**, evaluate:

| Criterion | PASS | FAIL | Your Result |
|-----------|------|------|-------------|
| Bot running without crashes | Uptime > 60 min | Any crash/restart | |
| Opportunities discovered | `discovered > 0` | 0 after 60 min | |
| Gate passing some trades | `gatePassed > 0` | 0 with `gateEvaluated > 10` | |
| Landing rate acceptable | > 30% | < 15% over window | |
| Net edge positive | `avgNetEdgeUsd > 0` or null (no confirms yet) | `avgNetEdgeUsd < 0` sustained | |
| Fee BPS reasonable | `avgFeeBpsOfNotional < 200` | > 300 sustained | |
| Quote freshness OK | `avgQuoteAgeMs < 5000` | > 10000 sustained | |
| No accumulator circuit break | No `reject_accumulator_negative` dominance | > 80% of rejections | |
| Rebalance functioning | Gate evaluating (if auto-fund on) | 0 evaluations after 60 min | |

### Decision:
- **All PASS**: Proceed to EXP-021 (Jito bundles) planning
- **1–2 FAIL (non-critical)**: Adjust config (fees, thresholds), re-run validation
- **3+ FAIL or any crash**: Diagnose root cause before proceeding

---

## 8. Config Knobs to Adjust If Needed

| Env Var | Current Default | Adjust If |
|---------|----------------|-----------|
| `MIN_NET_EDGE_USD` | 0.001 | Too many `reject_profit_below_floor` → lower |
| `MAX_REBALANCE_COST_BPS` | 100 | Rebalances always rejected → raise to 150–200 |
| `SPEED_TIER` | `medium` | Landing rate < 30% → try `aggressive` |
| `PRIORITY_FEE_PERCENTILE` | 75 | Fees too high → lower to 50; too low landing → raise to 90 |
| `LANDING_RATE_FLOOR` | 0.25 | Too many `reject_low_landing_rate` → lower |
| `SESSION_SUMMARY_INTERVAL_MS` | 600000 | Want faster feedback → set to 120000 (2 min) |
| `NET_EDGE_WINDOW_SIZE` | 20 | Accumulator triggering too fast → raise to 50 |
| `NET_EDGE_MIN_SAMPLES` | 5 | Not enough data for verdict → lower to 3 |

---

## 9. Log Grep Quick Reference

```bash
# Periodic session summary
grep "periodic_summary" bot.log

# All gate rejections with reasons
grep "execution_gate" bot.log | grep "passed.*false"

# Fee logs for confirmed trades
grep "execution fee" bot.log

# Quote age on specific submits
grep "tx_submitted" bot.log

# Landing rate reports
grep "landing_report" bot.log

# Rebalance gate decisions
grep "rebalance_gate" bot.log

# Net-edge accumulator state
grep "net_edge_snapshot" bot.log
```

---

**Template Version**: EXP-020.1
**Created**: 2026-04-13
**Next Experiment**: EXP-021 (Jito bundles) — blocked on EXP-020 green validation
