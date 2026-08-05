# Solana Shadow Performance Testing

> **The bot is not approved for unrestricted live trading.**
> Everything in this document runs with `SOLANA_LOG_ONLY=true`. Nothing here
> authorises a live trade.

## Purpose

Shadow mode runs the full Solana pipeline — scanner, opportunity detection,
Jupiter quoting, swap transaction building, execution gate, and the route / AMM
/ venue-risk filters — and then **stops immediately before signing and
sending**.

The point is to measure what the bot *would* have done, with real market data
and real quotes, without any capital at risk. A 24–72 hour shadow run answers
one question:

> If we had been trading, would we have made money — and is the pipeline
> reliable enough to trust with a live canary?

### What runs and what does not

| Stage | Shadow mode |
|---|---|
| Scanner | runs |
| Opportunity detection | runs |
| Jupiter quote fetch | runs (real network calls) |
| Route / AMM / venue-risk filters | run |
| Execution gate | runs |
| Swap transaction build | runs (real Jupiter `/swap` call) |
| Transaction signing | **does not run** |
| `sendTransaction` | **does not run** |

The executor returns `{ success: true, logOnly: true }` immediately after the
swap transaction is built. This is enforced by tests — see
[Safety guarantees](#safety-guarantees).

## Safe environment values

These are the recommended settings for a shadow run:

```bash
SOLANA_TRADING_ENABLED=true
SOLANA_LOG_ONLY=true
SOLANA_CANARY_MODE=true
SOLANA_MAX_NOTIONAL_USD=5
SOLANA_MIN_NOTIONAL_USD=3
SOLANA_MIN_EXPECTED_PROFIT_USD=0.10
SOLANA_MAX_DAILY_LOSS_USD=5
SOLANA_MAX_SLIPPAGE_BPS=50
SOLANA_ONLY_DIRECT_ROUTES=true
SOLANA_ALLOW_MULTIHOP=false
```

`SOLANA_TRADING_ENABLED=true` looks alarming next to `SOLANA_LOG_ONLY=true`,
but both are required. `SOLANA_TRADING_ENABLED=false` short-circuits the whole
pipeline before it ever requests a quote, so the run would produce no data at
all. `SOLANA_LOG_ONLY=true` is the gate that prevents sending.

### Shadow reporting settings

Snapshot persistence is **opt-in**. Without `SOLANA_SHADOW_SNAPSHOT_PATH`
nothing is written to disk and executor behaviour is unchanged.

```bash
# Where the periodic snapshot is written (enables shadow reporting)
SOLANA_SHADOW_SNAPSHOT_PATH=./shadow-snapshot.json

# How often to write it. Default 60000 (60s). Minimum 1000.
SOLANA_SHADOW_SNAPSHOT_INTERVAL_MS=60000
```

Writes are atomic (temp file + rename), so the report can be generated while
the run is still in progress without ever reading a half-written file.

## Running a 24-hour test

```bash
# 1. Confirm the safety flags before starting.
#    Do not proceed unless LOG_ONLY is true.
echo "$SOLANA_LOG_ONLY"   # must print: true

# 2. Start the bot with snapshot persistence enabled.
SOLANA_SHADOW_SNAPSHOT_PATH=./shadow-24h.json pnpm --filter @arbimind/bot start

# 3. Let it run for 24 hours.

# 4. Generate the report (can be run at any point during the run).
pnpm --filter @arbimind/bot shadow-report ./shadow-24h.json
```

## Running a 72-hour test

Identical, with a longer window. 72 hours is preferred over 24 because it
covers three daily liquidity cycles and at least one weekend boundary, both of
which materially change Solana spread behaviour.

```bash
SOLANA_SHADOW_SNAPSHOT_PATH=./shadow-72h.json pnpm --filter @arbimind/bot start

# Check progress at any point without stopping the run:
pnpm --filter @arbimind/bot shadow-report ./shadow-72h.json
```

For the raw snapshot instead of the formatted report:

```bash
pnpm --filter @arbimind/bot shadow-report ./shadow-72h.json --json
```

## How to read the report

```
SHADOW PERFORMANCE REPORT
============================================================

window:
  start                     2026-08-05T04:07:40.756Z
  captured                  2026-08-05T04:07:40.773Z
  duration                  26.40h

opportunities:
  detected                  4200
  skipped (pre-gate)        3310

quotes:
  requested                 890
  failed                    17 (1.9%)
  avg age                   410ms

swap builds:
  attempted                 102
  succeeded                 102
  failed                    0
  success rate              100.0%

gate pass rate:
  evaluated                 512
  passed                    103
  rejected                  409
  pass rate                 20.1%

top reject reasons:
  edge_bps_too_low=273
  net_profit_too_low=136

top pre-gate skips:
  notional_cap=2100
  route_filter=900
  risk_filter=310

top AMMs:
  Whirlpool=640
  Raydium CLMM=180
  Meteora DLMM=70

route types:
  direct=820
  multihop_2=70

latency:
  quote avg                 238ms
  quote max                 299ms
  swap build avg            280ms
  swap build max            329ms

expected economics:
  avg gross profit          $0.2900
  avg execution fee         $0.0410
  avg slippage cost         $0.0140
  avg net profit            $0.1640
  avg edge bps              390.48
  best gross seen           $0.8300

risk notes:
  rpc errors                11
  rpc rate-limited (429)    6
  rpc latency failures      0
  transactions submitted    0

recommendation:
  READY FOR $1 CANARY
    - 26.4h window with 512 gate evaluations
    - gate pass rate 20.1% (103 passed)
    - swap build success 100.0%
    - average net expected profit $0.1640
    - shadow evidence supports a manually-reviewed $1 canary — this is a recommendation, not an authorisation
```

### Reading each section

**`opportunities` / `top pre-gate skips`** — where opportunities die before the
gate. A large `notional_cap` count is normal and healthy under canary limits;
it means the scanner sees more than the caps allow. A large `route_filter`
count with `SOLANA_ONLY_DIRECT_ROUTES=true` is also expected.

**`quotes`** — `failed` above ~5% means the data feed is unreliable and no
economic conclusion drawn from the run is trustworthy. `avg age` is how stale
quotes were by the time the gate evaluated them; if it approaches
`SOLANA_QUOTE_MAX_AGE_MS`, real execution would be racing expiry.

**`gate pass rate`** — the headline. Pre-gate filter rejections are deliberately
**not** counted here; including them would inflate the denominator and
understate the gate.

**`top reject reasons`** — the single most actionable field. `edge_bps_too_low`
dominating means spreads are thin relative to the bps floor.
`net_profit_too_low` dominating means fees and slippage are eating the edge.

**`expected economics`** — all *expected* values derived from quotes, not
realised PnL. Shadow mode never executes, so no realised number exists. Treat
these as an optimistic ceiling: real execution adds drag that quotes do not
capture.

**`risk notes`** — `transactions submitted` must be `0`. If it is not, the
report prints `<-- NOT LOG-ONLY` **and the recommendation is forced to
`NOT READY`**. A run that submitted anything was not a shadow run, so none of
its numbers describe log-only behaviour and no readiness conclusion may be
drawn from it. Discard it. This disqualification outranks every other signal —
a contaminated run cannot reach a canary verdict no matter how good the rest of
its metrics look.

**`recommendation`** — derived conservatively and fails closed. See below.

### Recommendation values

| Verdict | Meaning |
|---|---|
| `NOT READY` | Either the run was **contaminated by live submissions** (checked first, outranks everything), or the pipeline is unhealthy — no quotes, high quote failures, unreliable swap builds, or significant RPC rate limiting. Fix before drawing any economic conclusion. |
| `CONTINUE SHADOW` | Nothing is wrong; there is just not enough evidence yet. Window under 24h or fewer than 200 gate evaluations. |
| `TUNE THRESHOLDS` | Enough evidence, unfavourable result. The gate rejects nearly everything, or passing trades are too marginal to survive execution drag. |
| `READY FOR $1 CANARY` | Every criterion met. **This is a recommendation, not an authorisation.** |

The thresholds are in `READINESS` in
[`packages/bot/src/solana/ShadowReport.ts`](../../packages/bot/src/solana/ShadowReport.ts):

| Criterion | Threshold |
|---|---|
| Transactions submitted | **must be 0** — any submission forces `NOT READY` |
| Window | ≥ 24h |
| Gate evaluations | ≥ 200 |
| Gate passes | ≥ 10 |
| Swap build success rate | ≥ 95% |
| Quote failure rate | ≤ 5% |
| Average net expected profit | > $0.02 |

A run that fails to produce evidence is treated as failing, never as passing.

## Safety guarantees

These are enforced by tests in
[`packages/bot/tests/unit/shadow-safety.test.ts`](../../packages/bot/tests/unit/shadow-safety.test.ts):

- With `SOLANA_LOG_ONLY=true`, the executor builds the swap transaction and
  never calls `sendTransaction`, never calls `confirmTransaction`, and never
  signs.
- `SOLANA_TRADING_ENABLED=false` skips before any network call.
- A missing wallet key skips before any quote or send.
- Notional caps and the canary ceiling reject oversized opportunities before
  quoting.
- The stale quote guard rejects aged quotes rather than sending them.
- The execution gate rejects insufficient net profit and insufficient edge bps,
  and no swap build is attempted once it rejects.

The suite includes a deliberate counter-test: the identical fixture with
`logOnly: false` is **required to reach** `sendTransaction`. Without it, "never
sends" would pass just as happily against a harness that could never reach the
send path at all. The two together prove the flag is what stops the send.

## Minimum criteria before a live canary

All of the following must hold, in addition to a `READY FOR $1 CANARY` verdict:

1. At least one **72-hour** run, not merely 24 hours.
2. `transactions submitted` is `0` across every shadow run.
3. Quote failure rate ≤ 5% and RPC rate limiting ≤ 2% of quotes.
4. Swap build success rate ≥ 95%.
5. Average net expected profit materially above the execution haircut — a
   margin, not a rounding difference.
6. Reject reasons understood, not merely observed. If `edge_bps_too_low`
   dominates, know why before changing the floor.
7. The report has been read by a human who agrees with its recommendation.

> ⚠️ **Do not set `SOLANA_LOG_ONLY=false` until shadow metrics justify it.**
> The shadow report is evidence for a decision. It is not the decision, and it
> cannot grant permission. Enabling live trading is always a manual, reviewed
> step.

> ⚠️ **Use an isolated canary wallet only.**
> Never point live mode at a wallet holding funds you are not prepared to lose
> entirely. The canary wallet must contain only test-risk capital and must not
> share keys with any other wallet.

## Live canary readiness checklist

**Not enabled. Do not action any of this without an explicit, separate decision.**

- [ ] Isolated wallet created (fresh keypair, not shared with any other wallet)
- [ ] Only test-risk capital funded
- [ ] `SOLANA_LOG_ONLY=false` reviewed manually — never scripted, never defaulted
- [ ] `SOLANA_MAX_NOTIONAL_USD` set to `1`
- [ ] `SOLANA_MAX_DAILY_LOSS_USD` set to `2`
- [ ] Direct routes only (`SOLANA_ONLY_DIRECT_ROUTES=true`)
- [ ] Multihop disabled (`SOLANA_ALLOW_MULTIHOP=false`)
- [ ] Slippage reduced below the shadow-run value
- [ ] Metrics confirmed working (a shadow report renders with real data)
- [ ] Rollback plan confirmed — how to stop, who stops it, how quickly

## Troubleshooting

**`shadow-report: cannot read snapshot`** — `SOLANA_SHADOW_SNAPSHOT_PATH` was
not set during the run, so nothing was written. The CLI exits non-zero here on
purpose: a missing run must not be mistaken for an empty one.

**Report shows `0` for everything** — the bot was running but never reached the
quote stage. Check `SOLANA_TRADING_ENABLED=true` and look at
`top pre-gate skips`.

**`<-- NOT LOG-ONLY` in the report** — `SOLANA_LOG_ONLY` was not `true`.
Transactions were submitted. Stop, discard the run, and investigate before
doing anything else.
