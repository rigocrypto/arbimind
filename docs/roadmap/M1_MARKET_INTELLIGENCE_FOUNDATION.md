# RIGO ARBIMIND M1 — Market Intelligence Foundation

**Status:** Proposed implementation contract  
**Roadmap parent:** [MULTI_ASSET_INTELLIGENCE_ROADMAP.md](./MULTI_ASSET_INTELLIGENCE_ROADMAP.md)  
**Initial scope:** MNQ + ES + SPY  
**Mode:** research-only

## 1. Scope guard

### Included

- canonical market-data adapters
- immutable market snapshots
- Data Quality + provenance
- Market Regime
- Trend / Momentum / Volume / Price Action / Candle / Pattern / Stochastic agents
- 1D / 4H / 1H / 15m / 5m hierarchy
- Signal Eligibility
- Risk Gate
- deterministic scoring
- Signal Arbiter
- Research Cards
- Evidence Store
- Outcome Engine
- MFE / MAE
- 10 / 25 / 50 / 100-bar checkpoints
- Market E-STOP

### Excluded

- Futures/Options broker execution
- automatic trade placement
- Options chain / Greeks / flow
- Dealer Positioning
- FuturePath
- Crowd Forecast
- online/self-modifying weights
- LLM-generated quantitative inputs
- personalized financial recommendations

## 2. Core invariant

For an immutable snapshot:

```text
same market snapshot
+ same engine version
+ same config version
= same signal result
```

This must hold in local development, CI, replay, and production.

## 3. Suggested persistence model

The concrete database technology may follow existing backend patterns, but M1 needs the following logical entities.

### engine_versions

- id
- engine_name
- version
- feature_schema
- config_version
- config_hash
- git_commit
- created_at

### instruments

- id
- symbol
- asset_class
- exchange
- tick_size
- point_value
- timezone
- session_profile
- active

### market_snapshots

- id
- instrument_id
- cutoff_at
- provider
- provider_dataset_version
- start_at
- end_at
- timeframes_present
- bars_count
- snapshot_uri / serialized snapshot reference
- snapshot_sha256
- freshness_ms
- completeness_pct
- quality_score
- created_at

### data_quality_checks

- id
- snapshot_id
- source
- timeframe
- freshness_score
- completeness_score
- continuity_score
- timestamp_score
- outlier_score
- overall_score
- status: PASS | WARNING | REJECT
- reason_codes[]
- created_at

### signal_runs

- id
- instrument_id
- engine_version_id
- market_snapshot_id
- started_at
- data_cutoff_at
- regime
- regime_confidence
- candidate_bias: BULLISH | BEARISH | NEUTRAL
- input_hash
- status: RUNNING | REJECTED | NO_TRADE | WATCH | SETUP | STRONG_SETUP | A_PLUS
- final_score
- created_at
- completed_at

### agent_outputs

- id
- signal_run_id
- agent_name
- agent_version
- timeframe
- direction
- signed_score (-100..100)
- strength (0..100)
- confidence (0..100)
- metrics JSON
- reason_codes[]
- evidence_refs[]
- created_at

### eligibility_checks

- id
- signal_run_id
- check_code
- status: PASS | WARNING | FAIL
- observed_value
- threshold_value
- hard_gate
- reason_code
- evidence_ref
- created_at

### risk_gate_results

- id
- signal_run_id
- risk_code
- severity: INFO | WARNING | HARD_REJECT
- actual_value
- threshold
- penalty_points
- reason_code
- created_at

### research_signals

- id
- signal_run_id
- instrument
- timeframe
- bias
- score
- classification
- reference_price
- invalidation_price
- invalidation_reason
- regime
- regime_confidence
- tf_coherence
- data_quality
- liquidity_quality
- top_contributors JSON
- generated_at

### signal_outcomes

- id
- research_signal_id
- horizon_bars
- start_price
- end_price
- return_pct
- return_atr
- mfe_pct
- mae_pct
- mfe_atr
- mae_atr
- mfe_r nullable
- mae_r nullable
- invalidation_hit
- target_hit nullable
- time_to_mfe_bars
- time_to_mae_bars
- observed_direction
- completed_at

### e_stop_events

- id
- scope: GLOBAL | PROVIDER | ASSET_CLASS | INSTRUMENT
- target
- trigger
- status: ACTIVE | CLEARED
- activated_at
- cleared_at
- evidence

## 4. Canonical agent contracts

```ts
interface AgentInput {
  runId: string;
  instrument: "MNQ" | "ES" | "SPY";
  timeframe: "1D" | "4H" | "1H" | "15m" | "5m";
  cutoffAt: string;
  snapshotId: string;
  regime: MarketRegime;
  regimeConfidence: number;
  bars: ReadonlyArray<CanonicalBar>;
  quality: DataQuality;
  engineVersion: string;
  configVersion: string;
}

interface AgentOutput {
  agent: string;
  version: string;
  timeframe: "1D" | "4H" | "1H" | "15m" | "5m";
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  signedScore: number; // -100..100
  strength: number;    // 0..100
  confidence: number;  // 0..100
  metrics: Record<string, number | string | boolean>;
  reasonCodes: string[];
  evidenceRefs: string[];
}
```

`signedScore` semantics:

- -100 = maximum bearish evidence
- 0 = neutral
- +100 = maximum bullish evidence

Agents do not decide trades. They emit evidence.

## 5. Regime contract

Market Regime output:

- regime: STRONG_TREND | TREND | RANGE | HIGH_VOLATILITY | LOW_VOLATILITY | TRANSITION
- directionalBias: BULLISH | BEARISH | NEUTRAL
- confidence: 0..100
- weightProfile: versioned profile identifier
- reasonCodes[]

The regime engine selects a versioned weight profile. It must not invent ad-hoc weights at runtime.

## 6. Core agents

### Trend

Candidate inputs:

- swing structure
- HH/HL and LH/LL
- EMA alignment
- slope
- ADX/strength
- break of structure

### Momentum

- ROC
- RSI
- MACD
- acceleration/deceleration
- divergence

### Volume

- relative volume
- expansion/contraction
- breakout/rejection volume
- buy/sell imbalance only if the provider supplies a defensible metric

### Price Action

- support/resistance interaction
- VWAP relationship
- break/retest
- failed breakout
- impulse/correction
- structure distance

### Candle

Small deterministic vocabulary:

- engulfing
- rejection/pin
- inside bar
- outside bar
- momentum candle
- exhaustion candle

Candle patterns are evidence, not automatic BUY/SELL instructions.

### Pattern

M1 pattern set is intentionally small:

- flag
- channel
- triangle
- double top/bottom
- breakout/retest
- range

### Stochastic

Thresholds and periods must live in versioned config, never hard-coded into scoring logic.

## 7. Multi-timeframe hierarchy

```text
1D + 4H → macro context / hard directional filter
1H      → setup
15m     → confirmation
5m      → timing
```

These are not equal votes.

A strong 4H conflict must be able to reject or materially degrade a lower-timeframe setup according to versioned policy.

## 8. Deterministic scoring

Each agent emits a signed score `s_i ∈ [-100,100]`.

For a candidate direction `d`:

- `d = +1` for bullish
- `d = -1` for bearish

Aligned evidence:

```text
Aligned_i = (100 + d * s_i) / 2
```

Base confluence:

```text
C = Σ(w_i * Aligned_i)
Σw_i = 1
```

Weights come only from the versioned regime profile.

Recommended factor construction:

```text
RegimeFactor = 0.85 + 0.15 * regimeConfidence01
TFFactor     = 0.70 + 0.30 * tfCoherence01
DQFactor     = 0.80 + 0.20 * dataQuality01
LQFactor     = 0.85 + 0.15 * liquidityQuality01
```

Pre-penalty score:

```text
S_pre = C * RegimeFactor * TFFactor * DQFactor * LQFactor
```

Final score:

```text
S_final = clamp(S_pre - allowedSoftPenalties, 0, 100)
```

Quality degradation must never increase a signal score.

## 9. Signal Eligibility

Eligibility happens before public classification.

Hard-gate examples:

- DATA_FRESHNESS
- DATA_COMPLETENESS
- REQUIRED_TIMEFRAMES
- TIMESTAMP_INTEGRITY
- MIN_HISTORY
- DATA_OUTLIER
- MARKET_ESTOP
- EVENT_BLACKOUT
- LIQUIDITY_MINIMUM
- STRONG_MACRO_CONFLICT
- DUPLICATE_SIGNAL

Hard failure => `REJECTED`.

`REJECTED` means the observation is not valid for edge statistics.

`NO_TRADE` means the observation was validly evaluated but lacked sufficient edge.

## 10. Classification

After hard gates:

| Final score | State |
|---:|---|
| 0-59 | NO_TRADE |
| 60-69 | WATCH |
| 70-79 | SETUP |
| 80-89 | STRONG_SETUP |
| 90-100 | A_PLUS |

A `NEUTRAL` candidate bias can never exceed `WATCH`.

## 11. Signal Arbiter responsibilities

The Arbiter:

1. verifies engine/config versions;
2. runs eligibility;
3. evaluates regime;
4. runs deterministic agents;
5. calculates macro bias;
6. determines candidate bias;
7. calculates timeframe coherence;
8. runs Risk Gate;
9. loads the regime weight profile;
10. calculates aligned confluence;
11. applies quality factors and allowed penalties;
12. classifies the result;
13. freezes an evidence bundle.

The Arbiter does not call an LLM and does not generate market facts.

## 12. Research Card contract

Every published card should include:

- Signal ID
- Engine version
- Config version
- Data cutoff
- Instrument/timeframe
- Classification
- Score
- Bias
- Regime + confidence
- Data Quality
- TF Coherence
- Liquidity Quality
- top contributors
- degraders/penalties
- invalidation
- evidence/reason codes
- `WHY THIS SCORE?` exact contribution breakdown

The explanation layer may translate reason codes into prose, but it cannot alter numbers.

## 13. Outcome Engine

Outcome collection is independent of user behavior.

For each research signal, track at:

- +10 bars
- +25 bars
- +50 bars
- +100 bars

Metrics:

- ending return
- ATR-normalized return
- MFE
- MAE
- MFE/MAE in ATR
- MFE/MAE in R only when a valid invalidation distance exists
- invalidation hit
- time to MFE
- time to MAE
- observed direction

Historical signals are immutable. Outcomes append observations; they do not rewrite the original signal.

## 14. Data Quality

Every external feature must record:

- provider
- provider dataset/version when available
- timestamp
- freshness
- completeness
- continuity
- outlier status
- quality score

A stale or failed provider is not replaced by an AI guess.

## 15. Market E-STOP

Triggers may include:

- data-integrity failure
- provider staleness
- excessive latency
- exchange halt
- extreme volatility/anomaly
- model/engine failure
- manual operator action

When active, new affected signal runs are `REJECTED`.

M1 does not place trades, so E-STOP controls research-signal generation only.

## 16. Proposed package boundary

Repository mapping shows existing backend service/routing structure. M1 should be isolated from current execution services.

Suggested starting point:

```text
packages/backend/src/market-intelligence/
├── data/
├── features/
├── agents/
├── regime/
├── multitf/
├── eligibility/
├── risk/
├── scoring/
├── arbiter/
├── evidence/
├── outcomes/
├── config/
└── types/

packages/backend/src/routes/market-intelligence.ts

packages/ui/src/app/research/
packages/ui/src/components/market-intelligence/
```

Do not place M1 scoring inside the UI. Do not couple it to `SolanaExecutor` or existing execution endpoints.

## 17. Minimum test matrix

| ID | Test | Expected |
|---|---|---|
| M1-DATA-001 | identical snapshot twice | same hash + same output |
| M1-DATA-002 | required bar missing | REJECTED |
| M1-DATA-003 | timestamp disorder | REJECTED |
| M1-DATA-004 | stale feed | REJECTED |
| M1-DATA-005 | NaN/Infinity | REJECTED |
| M1-AGENT-001 | bullish trend fixture | signed score > 0 |
| M1-AGENT-002 | bearish trend fixture | signed score < 0 |
| M1-AGENT-003 | range fixture | near neutral |
| M1-REGIME-001 | trend fixture | expected regime |
| M1-REGIME-002 | range fixture | expected regime |
| M1-TF-001 | aligned macro/lower TF | high coherence |
| M1-TF-002 | 4H conflict vs 5m | degrade/reject |
| M1-GATE-001 | E-STOP active | REJECTED |
| M1-GATE-002 | liquidity below floor | REJECTED |
| M1-GATE-003 | extreme event blackout | REJECTED |
| M1-SCORE-001 | same inputs | same score |
| M1-SCORE-002 | opposite trend | confluence falls |
| M1-SCORE-003 | lower DQ | score cannot rise |
| M1-SCORE-004 | lower coherence | score cannot rise |
| M1-SCORE-005 | lower liquidity | score cannot rise |
| M1-CLASS-001 | 59 | NO_TRADE |
| M1-CLASS-002 | 60 | WATCH |
| M1-CLASS-003 | 70 | SETUP |
| M1-CLASS-004 | 80 | STRONG_SETUP |
| M1-CLASS-005 | 90 | A_PLUS |
| M1-CLASS-006 | neutral + high numeric score | max WATCH |
| M1-EVID-001 | Research Card | every value traceable |
| M1-EVID-002 | snapshot changed | input hash changes |
| M1-OUT-001 | +10 bars | outcome created |
| M1-OUT-002 | +100 bars | lifecycle complete |
| M1-OUT-003 | no user trade | outcome still created |
| M1-ESTOP-001 | trigger E-STOP | new runs rejected |
| M1-ESTOP-002 | clear E-STOP | runs resume |
| M1-REG-001 | historical replay | deterministic |

## 18. Implementation order

1. M1 preflight / repo mapping
2. provider interface + canonical bars
3. immutable snapshot + hash
4. data-quality gates
5. deterministic regime + core-agent fixtures
6. multi-timeframe engine
7. eligibility + risk
8. scoring + arbiter
9. evidence bundle
10. Research Card API/UI
11. Outcome Engine
12. replay/regression suite
13. M1 exit review

## 19. M1 exit gate

M1 is not complete until:

- MNQ, ES, SPY supported in research mode;
- all required timeframes supported;
- deterministic regime/agents/scoring proven;
- no fabricated values;
- stale/missing/invalid data hard-rejected;
- E-STOP proven;
- `REJECTED != NO_TRADE`;
- Research Card values fully traceable;
- signal/input/config/engine versions persisted;
- 10/25/50/100-bar outcomes persisted;
- MFE/MAE persisted;
- historical replay green;
- regression suite green;
- no Futures/Options broker execution introduced.

After this gate, M2 may add Options Intelligence without changing the core M1 invariants.
