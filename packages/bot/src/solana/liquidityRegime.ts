// packages/bot/src/solana/liquidityRegime.ts
// EXP-014 candidate: time/liquidity regime features
// Phase 1: feature injection + logging only — NO execution policy changes yet
// Promote to dynamic thresholds only after 1 week of logged validation data

export interface LiquidityRegime {
  utcHour: number;
  utcDayOfWeek: number;       // 0 = Sunday, 6 = Saturday
  isWeekend: boolean;
  isPeakWindow: boolean;       // 12–18 UTC: EU + early US overlap
  isLondonNyOverlap: boolean;  // 13–17 UTC: tightest spreads historically
  isLowLiquidityWindow: boolean; // 00–06 UTC: thin, wider spreads
  regimeLabel: "peak" | "overlap" | "low" | "normal";
}

export function getLiquidityRegime(now: Date = new Date()): LiquidityRegime {
  const utcHour = now.getUTCHours();
  const utcDayOfWeek = now.getUTCDay();
  const isWeekend = utcDayOfWeek === 0 || utcDayOfWeek === 6;

  const isPeakWindow        = utcHour >= 12 && utcHour < 18;
  const isLondonNyOverlap   = utcHour >= 13 && utcHour < 17;
  const isLowLiquidityWindow = utcHour >= 0  && utcHour < 6;

  let regimeLabel: LiquidityRegime["regimeLabel"] = "normal";
  if (isLondonNyOverlap && !isWeekend) regimeLabel = "overlap";
  else if (isPeakWindow && !isWeekend)  regimeLabel = "peak";
  else if (isLowLiquidityWindow)        regimeLabel = "low";

  return {
    utcHour,
    utcDayOfWeek,
    isWeekend,
    isPeakWindow,
    isLondonNyOverlap,
    isLowLiquidityWindow,
    regimeLabel,
  };
}

// =============================================================================
// Phase 2 (DO NOT enable until 1 week of logged data validates the pattern)
// =============================================================================

export interface RegimePolicyAdjustment {
  confidenceThresholdDelta: number;  // add to base threshold
  maxNotionalMultiplier: number;     // multiply base notional
  maxSlippageBpsDelta: number;       // add to base slippage bps
}

const REGIME_POLICY: Record<LiquidityRegime["regimeLabel"], RegimePolicyAdjustment> = {
  overlap: { confidenceThresholdDelta: -0.02, maxNotionalMultiplier: 1.25, maxSlippageBpsDelta: -5  },
  peak:    { confidenceThresholdDelta: -0.01, maxNotionalMultiplier: 1.10, maxSlippageBpsDelta: -3  },
  normal:  { confidenceThresholdDelta:  0.00, maxNotionalMultiplier: 1.00, maxSlippageBpsDelta:  0  },
  low:     { confidenceThresholdDelta: +0.05, maxNotionalMultiplier: 0.60, maxSlippageBpsDelta: +5  },
};

// Weekend overlay: applied on top of regime policy
const WEEKEND_NOTIONAL_MULTIPLIER = 0.80;
const WEEKEND_CONFIDENCE_DELTA    = +0.03;

export function getRegimePolicyAdjustment(regime: LiquidityRegime): RegimePolicyAdjustment {
  const base = { ...REGIME_POLICY[regime.regimeLabel] };
  if (regime.isWeekend) {
    base.maxNotionalMultiplier  *= WEEKEND_NOTIONAL_MULTIPLIER;
    base.confidenceThresholdDelta += WEEKEND_CONFIDENCE_DELTA;
  }
  return base;
}

// =============================================================================
// Logging schema — attach to every scored opportunity and swap outcome
// =============================================================================

export interface RegimeLogEntry {
  ts: string;                          // ISO timestamp
  utcHour: number;
  utcDayOfWeek: number;
  isWeekend: boolean;
  regimeLabel: string;
  // opportunity fields
  confidence: number;
  scored: boolean;
  attempted: boolean;
  // outcome fields (null if not attempted)
  confirmed: boolean | null;
  errorCode: string | null;            // e.g. "0x1788", "0x1" etc
  ammLabel: string | null;
  attempt: number | null;
  netPnlUsd: number | null;
}

export function makeRegimeLogEntry(
  regime: LiquidityRegime,
  opportunity: {
    confidence: number;
    scored: boolean;
    attempted: boolean;
    confirmed?: boolean;
    errorCode?: string;
    ammLabel?: string;
    attempt?: number;
    netPnlUsd?: number;
  }
): RegimeLogEntry {
  return {
    ts: new Date().toISOString(),
    utcHour:      regime.utcHour,
    utcDayOfWeek: regime.utcDayOfWeek,
    isWeekend:    regime.isWeekend,
    regimeLabel:  regime.regimeLabel,
    confidence:   opportunity.confidence,
    scored:       opportunity.scored,
    attempted:    opportunity.attempted,
    confirmed:    opportunity.confirmed   ?? null,
    errorCode:    opportunity.errorCode   ?? null,
    ammLabel:     opportunity.ammLabel    ?? null,
    attempt:      opportunity.attempt     ?? null,
    netPnlUsd:    opportunity.netPnlUsd   ?? null,
  };
}
