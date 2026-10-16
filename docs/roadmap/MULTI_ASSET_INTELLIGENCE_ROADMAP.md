# ArbiMind Multi-Asset Intelligence Roadmap

**Status:** Proposed / implementation-ready planning baseline  
**Snapshot date:** 2026-10-09  
**Target repository:** `rigocrypto/arbimind`

## 1. Product direction

ArbiMind currently operates as a Web3/MEV/searcher platform with backend, bot, contracts, UI, deployment automation, smoke checks, security gates, Solana/EVM execution paths, and opportunity analytics.

The next product evolution is a **Multi-Asset Intelligence Engine** that reuses ArbiMind's existing opportunity/risk/evidence mindset while adding deterministic research for traditional markets.

The new market-intelligence surface MUST remain separate from existing on-chain execution paths.

### Strategic product model

```text
ArbiMind
├── Web3 / Arbitrage Engine          # existing product surface
│   ├── Solana / Jupiter
│   ├── EVM / DEX opportunities
│   ├── LOG_ONLY / execution controls
│   └── existing risk + ops gates
│
├── Multi-Asset Intelligence         # roadmap M1-M5
│   ├── Futures Intelligence
│   ├── Options Intelligence
│   ├── Equity / ETF Intelligence
│   ├── Commodity Intelligence
│   ├── Crypto Market Intelligence
│   ├── FuturePath Simulator
│   └── Crowd Forecast
│
└── Digital Asset Foundry            # parallel future product track
    ├── NFT Agent
    ├── 2D / game asset agents
    ├── code asset agent
    ├── 3D/procedural asset agent
    └── marketplace packaging / QA
```

## 2. Non-negotiable design principles

1. **Research-first for Futures/Options.** M1-M5 do not auto-execute securities, futures, or options trades.
2. **Deterministic quantitative core.** LLMs may explain results; they MUST NOT invent or modify market inputs, scores, gates, invalidations, or outcomes.
3. **Evidence before claims.** Every research signal must be reproducible from a versioned engine, config, market snapshot, and evidence bundle.
4. **Hard gates before scoring.** Stale/incomplete data, E-STOP, invalid timestamps, or hard risk failures produce `REJECTED`, not a degraded-looking setup.
5. **REJECTED != NO_TRADE.** Rejected observations do not contaminate edge/performance statistics.
6. **No forced signals.** The system should prefer `NO_TRADE` over weak or illiquid setups.
7. **Outcome data is independent of user execution.** MFE/MAE and horizon outcomes are tracked even if no user trades.
8. **AI and Crowd remain independent.** When Crowd Forecast ships, user voting does not feed the live model unless separately researched and validated.
9. **Current Web3 execution remains isolated.** New market-intelligence code must not weaken existing signer, LOG_ONLY, canary, audit, or deployment controls.

## 3. Architecture

```text
Market Data Adapters
        ↓
Canonical Market Snapshot + Data Quality
        ↓
Feature Layer
        ↓
Market Regime Engine
        ↓
Core Agents
Trend · Momentum · Volume · Price Action · Candle · Pattern · Stochastic
        ↓
Multi-Timeframe Engine
1D / 4H / 1H / 15m / 5m
        ↓
Signal Eligibility
        ↓
Risk Gate
        ↓
Deterministic Confluence Engine
        ↓
Signal Arbiter
        ↓
Evidence Store
        ↓
Research Card
        ↓
Outcome Engine
```

Specialized asset adapters sit above this shared kernel. Futures and Options share the analytical brain, not the entire sensory/data layer.

---

# M0 — Current-System Stabilization

**Goal:** enter M1 without weakening the current ArbiMind platform.

Repository snapshot on 2026-10-09 shows active CI/security/Solana maintenance work, including open PR #414 and issues in the #401-#415 range.

Before M1 implementation begins:

- review/close or explicitly defer current CI/security/env/runtime issues;
- resolve the LOG_ONLY economics path represented by PR #414 / related issues;
- preserve current Node/.nvmrc authority and audit-gate behavior;
- keep existing backend/bot/ui build checks green;
- preserve signer and runtime-integrity protections;
- establish a clean M1 branch point.

**M0 exit:** current `main` is green enough to serve as a stable baseline and all known carry-forward risks are explicitly documented.

---

# M1 — Market Intelligence Foundation

**Initial instruments:** `MNQ`, `ES`, `SPY`  
**Mode:** research-only  
**Timeframes:** 1D, 4H, 1H, 15m, 5m

## Included

- Market Data Adapter abstraction
- canonical OHLCV/snapshot model
- Data Quality scoring + provenance
- Market Regime Engine
- Trend Agent
- Momentum Agent
- Volume Agent
- Price Action Agent
- Candle Agent
- Pattern Agent
- Stochastic Agent
- Multi-Timeframe Engine
- Signal Eligibility
- Risk Gate
- deterministic Confluence Engine
- Signal Arbiter
- Research Cards
- `WHY THIS SCORE?` contribution breakdown
- Evidence Store
- Outcome Engine
- 10 / 25 / 50 / 100-bar outcome checkpoints
- MFE / MAE
- Market E-STOP

## Explicitly excluded

- broker execution
- automatic Futures/Options trading
- options chains / Greeks / flow
- Dealer Gamma
- ML-driven live weight mutation
- FuturePath
- Crowd Forecast
- personalized financial recommendations

## M1 hard exit criteria

- deterministic scoring and replay
- zero fabricated market data
- stale/missing/invalid data => `REJECTED`
- hard gates proven by tests
- multi-timeframe conflict handling proven
- `REJECTED` and `NO_TRADE` tracked separately
- complete signal evidence bundle
- complete MFE/MAE tracking
- E-STOP blocks new research signals
- regression suite green
- historical replay green
- no new broker execution surface

See [M1 implementation specification](./M1_MARKET_INTELLIGENCE_FOUNDATION.md).

---

# M2 — Options Intelligence

Build Options Intelligence on top of the M1 kernel.

## Scope

- Option Chain Adapter
- Open Interest
- option volume / Vol-OI
- bid-ask liquidity
- Greeks: Delta, Gamma, Theta, Vega
- IV / IV Rank / IV Percentile
- skew / term structure
- Expected Move vs Realized Move
- basic Options Flow
- Strategy Selection Agent
- explicit `NO_TRADE` rules
- defined-risk research structures
- SPY first; QQQ/IWM after evidence

## Deferred until data quality is proven

- Dealer Gamma / GEX
- gamma flip / call wall / put wall
- sweeps / blocks
- dark-pool-derived features

---

# M3 — Evidence Learning

**Goal:** turn ArbiMind's immutable signal/outcome history into a defensible research dataset.

- calibrate regime weight profiles offline;
- evaluate expectancy by asset/regime/timeframe;
- measure feature contribution stability;
- add calibration metrics;
- add advanced Data Quality scoring;
- prevent overfitting with train/validation/test windows;
- version every recalibration;
- never mutate historical signal results;
- promote new weights only through explicit validation gates.

Example research questions:

- Which factor combinations have positive expectancy on MNQ in low-volatility regimes?
- Does Options Flow add predictive value after controlling for trend and liquidity?
- What horizons retain meaningful directional edge?
- When does multi-timeframe conflict correctly suppress false setups?

---

# M4 — FuturePath + Multi-Asset Expansion

## FuturePath Simulator

FuturePath is probabilistic. It MUST NOT claim exact future candles.

Outputs:

- 10 / 25 / 50 / 100-candle horizons;
- bullish continuation / range / bearish reversal scenarios;
- probability cones;
- scenario invalidation;
- uncertainty that expands with horizon;
- candle-by-candle reweighting as new data arrives;
- historical pattern matching conditioned on regime/timeframe/volatility;
- Monte Carlo / sequence-model ensemble only after offline validation.

FuturePath performance must be evaluated using realized outcomes and calibration, not visual plausibility.

## Multi-asset expansion

Reuse the M1 kernel for additional:

- crypto research;
- broader futures / commodities;
- equities / ETFs;
- additional indices.

Each asset class receives its own data adapter and risk semantics.

---

# M5 — Crowd Forecast + RealSona Integration

## Crowd Forecast

Users can vote on forecast scenarios:

- Bullish continuation
- Range / consolidation
- Bearish reversal

Rules:

- user votes before seeing crowd totals;
- optionally hide ArbiMind's forecast until after vote;
- votes close before the forecast horizon resolves;
- no editing after observed price action;
- raw Crowd and Smart Crowd displayed separately;
- forecast reputation based on historical calibration, not activity volume;
- AI model and crowd input remain independent in live scoring.

Research surfaces:

- AI vs Crowd agreement
- AI vs Crowd divergence
- high-reputation forecasters
- directional accuracy
- confidence calibration

## RealSona / CompanyOS

Expose ArbiMind as a governed capability provider rather than duplicating CompanyOS.

Potential capabilities:

- Market Research
- Futures Intelligence
- Options Intelligence
- FuturePath
- Digital Asset Research
- Web3 / RWA Intelligence
- AssetForge

CompanyOS remains responsible for:

- identity
- permissions
- approvals
- policy
- audit
- E-STOP/governance
- cross-company routing

---

# Parallel Track — AssetForge / NFT Agent

This track does not block M1-M5.

ArbiMind may later operate a digital-product foundry with:

- Opportunity Agent
- Product Strategist
- NFT Agent
- 2D Asset Agent
- Code Asset Agent
- 3D/Blender procedural agent
- QA / IP / marketplace-compliance agent
- Packaging Agent
- Publisher workflow with human approval
- sales/outcome analytics

The objective is not bulk AI content generation; it is evidence-driven creation of coherent commercial asset packs.

---

# Data priorities

## Must-have for M1/M2

- price + volume
- reliable timestamps
- futures session metadata
- Open Interest for Options
- Greeks
- IV history
- bid-ask spread
- event calendar

## Later / provider-dependent

- labeled sweeps
- block trades
- GEX
- dark-pool prints
- high-quality order-flow imbalance
- sentiment as a secondary feature only

Every external feature must carry provenance, freshness, completeness, and quality metadata.

---

# Proposed code boundary

Do not mix the new research kernel into existing execution services.

Suggested structure after repository mapping:

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

packages/backend/src/routes/
└── market-intelligence.ts

packages/ui/src/app/
└── research/

packages/ui/src/components/
└── market-intelligence/
```

Exact paths may change during M1 preflight, but dependency direction is fixed:

```text
DATA → FEATURES → AGENTS → REGIME/MULTI-TF
     → ELIGIBILITY/RISK → SCORING → ARBITER
     → EVIDENCE → RESEARCH CARD → OUTCOME
```

The UI never calculates a signal. The Outcome Engine never rewrites a past signal. An LLM never modifies quantitative outputs.

---

# Implementation sequence

1. Finish M0 / record carry-forward risks.
2. Run M1 repository mapping and data-provider decision.
3. Implement canonical market data + snapshot hashing.
4. Implement deterministic agents and fixtures.
5. Implement Multi-TF + eligibility + risk.
6. Implement deterministic scoring + arbiter.
7. Implement evidence + research cards.
8. Implement outcome checkpoints.
9. Historical replay / regression gate.
10. Only then open M2.

This document is the strategic roadmap. Detailed M1 contracts live in [M1_MARKET_INTELLIGENCE_FOUNDATION.md](./M1_MARKET_INTELLIGENCE_FOUNDATION.md).
