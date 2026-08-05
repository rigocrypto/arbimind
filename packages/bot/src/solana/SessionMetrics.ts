/**
 * SessionMetrics — EXP-020 observability layer
 *
 * Tracks execution funnel counters, reject-reason breakdown, fee normalization,
 * quote-age stats, and emits periodic session summary logs.
 */

import { Logger } from '../utils/Logger';

const logger = new Logger('SessionMetrics');

// ── Types ──────────────────────────────────────────────────────────

export interface FunnelSnapshot {
  /** Opportunities discovered by scanner */
  discovered: number;
  /** Opportunities skipped before reaching the execution gate */
  skipped: number;
  /** Skip reason breakdown (pre-gate: caps, guards, filters) */
  skipReasons: Record<string, number>;
  /** Jupiter quote requests issued */
  quotesRequested: number;
  /** Jupiter quote requests that threw or returned unusable data */
  quoteFailures: number;
  /** Swap build attempts (succeeded + failed) */
  swapBuildsAttempted: number;
  /** Opportunities that entered the execution gate */
  gateEvaluated: number;
  /** Opportunities that passed the execution gate */
  gatePassed: number;
  /** Opportunities rejected by the execution gate */
  gateRejected: number;
  /** Reject reason breakdown */
  rejectReasons: Record<string, number>;
  /** Swap transactions built successfully */
  swapsBuilt: number;
  /** Swap build failures */
  swapBuildFailed: number;
  /** Transactions submitted to network */
  submitted: number;
  /** Transactions confirmed on-chain */
  confirmed: number;
  /** Transactions expired (blockheight exceeded) */
  expired: number;
  /** Transactions failed on-chain */
  failed: number;
  /** Rebalance gate evaluations */
  rebalanceEvaluated: number;
  /** Rebalance gate rejections */
  rebalanceRejected: number;
}

export interface QuoteAgeStats {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

/** Rolling latency accumulator (count/total/min/max) for a single measured stage. */
export interface LatencyStats {
  count: number;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
}

/**
 * RPC health counters.
 *
 * `rateLimited` is tracked separately from `errors` because a 429 during a
 * shadow run means "reduce scan rate", while a non-429 error means
 * "investigate the provider" — conflating them hides which one is happening.
 */
export interface RpcHealthCounters {
  errors: number;
  rateLimited: number;
  latencyFailures: number;
}

/**
 * AI scoring funnel.
 *
 * Every opportunity is gated on a score being produced, so an unscored run
 * yields zeros across the entire executor funnel. These counters exist so that
 * "no opportunities" can be told apart from "the scorer never answered" —
 * previously indistinguishable.
 *
 * Note `actionable` and `belowConfidence` describe the *scorer's own verdict*.
 * The scanner's execution decision is currently derived from net edge, not from
 * the score, so these are observational rather than gating. See the report's
 * AI scoring section, which states this explicitly.
 */
export interface AiScoringCounters {
  requested: number;
  returned: number;
  /** Scorer not configured, or explicitly disabled. */
  missing: number;
  errored: number;
  /** Scorer recommended EXECUTE. */
  actionable: number;
  /** Scorer answered but did not recommend execution. */
  belowConfidence: number;
}

export interface FeeNormStats {
  count: number;
  totalFeeBps: number;
  totalNetEdgeBps: number;
  minFeeBps: number;
  maxFeeBps: number;
}

export interface SessionSummary extends FunnelSnapshot {
  sessionDurationSec: number;
  avgQuoteAgeMs: number | null;
  minQuoteAgeMs: number | null;
  maxQuoteAgeMs: number | null;
  avgFeeBpsOfNotional: number | null;
  avgNetEdgeBpsOfNotional: number | null;
  avgExpectedGrossUsd: number | null;
  avgExecutionFeeUsd: number | null;
  avgNetEdgeUsd: number | null;
  avgSlippageCostUsd: number | null;
}

/**
 * Full shadow-run snapshot — everything a 24–72h log-only report needs.
 *
 * Serializable by design: written to disk periodically so the report script can
 * read a run that is still in progress, or one whose process has already exited.
 *
 * Contains no wallet keys, RPC URLs, provider API keys, or signatures. Only
 * counters, latencies, USD aggregates and venue labels.
 */
export interface ShadowSnapshot extends SessionSummary {
  /** Schema version, so the report script can refuse snapshots it cannot read. */
  schemaVersion: 1;
  startedAtIso: string;
  capturedAtIso: string;
  quoteLatency: LatencyStats;
  swapBuildLatency: LatencyStats;
  rpc: RpcHealthCounters;
  /** How scoring was configured for this run. */
  aiScoringMode: string;
  ai: AiScoringCounters;
  /** AMM labels seen in quote route plans, by count. */
  ammLabels: Record<string, number>;
  /** Route shapes seen (`direct`, `multihop_2`, ...), by count. */
  routeTypes: Record<string, number>;
  bestGrossOverallUsd: number;
  bestGrossPerPair: Record<string, number>;
}

// ── Config ─────────────────────────────────────────────────────────

export interface SessionMetricsConfig {
  /** How often to emit a summary log (ms). Default: 600_000 (10 min). */
  summaryIntervalMs: number;
}

const DEFAULT_CONFIG: SessionMetricsConfig = {
  summaryIntervalMs: 600_000,
};

// ── Reason normalisation ───────────────────────────────────────────

/**
 * Collapse a free-text skip reason into a stable, low-cardinality key.
 *
 * Executor skip strings interpolate dollar amounts, mint addresses and
 * millisecond values (`notional $4.13 exceeds max $5.00`). Counting them raw
 * would produce thousands of singleton buckets over a 72h run and make
 * "top reject reasons" useless, so each known family maps to a fixed key.
 */
export function normaliseReason(reason: string): string {
  const r = reason.toLowerCase().trim();

  // Prefixed families emitted by the route/AMM/risk/gate filters.
  const prefixed: Array<[string, string]> = [
    ['execution gate:', 'execution_gate'],
    ['route filter:', 'route_filter'],
    ['amm filter:', 'amm_filter'],
    ['risk filter:', 'risk_filter'],
    ['inventory gate:', 'inventory_gate'],
    ['funding_cooldown', 'funding_cooldown'],
    ['below_min_notional', 'below_min_notional'],
  ];
  for (const [prefix, key] of prefixed) {
    if (r.startsWith(prefix)) {
      // Keep the specific sub-reason for gate rejections: it is the single most
      // actionable field in the report, and it is already low-cardinality.
      if (key === 'execution_gate') {
        const sub = r.slice(prefix.length).trim().split(/\s+/)[0];
        return sub ? `execution_gate:${sub}` : key;
      }
      return key;
    }
  }

  const contains: Array<[string, string]> = [
    ['solana_trading_enabled is false', 'trading_disabled'],
    ['exceeds max', 'notional_cap'],
    ['below minimum', 'below_min_profit'],
    ['daily loss cap', 'daily_loss_cap'],
    ['solana_private_key', 'missing_wallet_key'],
    ['missing solana_rpc_url', 'missing_rpc_url'],
    ['inventory lock held', 'inventory_lock_held'],
    ['dynamic trade size', 'sizing_failed'],
    ['zero outamount', 'zero_out_amount'],
    ['quote stale', 'quote_stale'],
    ['stop loss', 'stop_loss'],
    ['take profit', 'take_profit'],
  ];
  for (const [needle, key] of contains) {
    if (r.includes(needle)) return key;
  }

  // Unknown shape: strip volatile numerics so at least near-duplicates merge,
  // and cap length so one malformed string cannot dominate the report.
  return r
    .replace(/\$?\d[\d,._]*/g, 'N')
    .replace(/\s+/g, '_')
    .slice(0, 48);
}

// ── Latency helpers ────────────────────────────────────────────────

interface LatencyAccumulator {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

function newLatencyAccumulator(): LatencyAccumulator {
  return { count: 0, totalMs: 0, minMs: Infinity, maxMs: -Infinity };
}

function observeLatency(acc: LatencyAccumulator, ms: number): void {
  // Negative or non-finite durations mean the caller mis-measured; recording
  // them would silently skew the average the report is meant to be trusted for.
  if (!Number.isFinite(ms) || ms < 0) return;
  acc.count++;
  acc.totalMs += ms;
  if (ms < acc.minMs) acc.minMs = ms;
  if (ms > acc.maxMs) acc.maxMs = ms;
}

function summariseLatency(acc: LatencyAccumulator): LatencyStats {
  if (acc.count === 0) {
    return { count: 0, avgMs: null, minMs: null, maxMs: null };
  }
  return {
    count: acc.count,
    avgMs: +(acc.totalMs / acc.count).toFixed(1),
    minMs: +acc.minMs.toFixed(1),
    maxMs: +acc.maxMs.toFixed(1),
  };
}

// ── Class ──────────────────────────────────────────────────────────

export class SessionMetrics {
  private readonly config: SessionMetricsConfig;
  private readonly startedAt = Date.now();
  private summaryTimer: ReturnType<typeof setInterval> | null = null;

  // Funnel counters
  private discovered = 0;
  private skipped = 0;
  private skipReasons: Record<string, number> = {};
  private quotesRequested = 0;
  private quoteFailures = 0;
  private swapBuildsAttempted = 0;
  private gateEvaluated = 0;
  private gatePassed = 0;
  private gateRejected = 0;
  private rejectReasons: Record<string, number> = {};
  private swapsBuilt = 0;
  private swapBuildFailed = 0;
  private submitted = 0;
  private confirmed = 0;
  private expired = 0;
  private failed = 0;
  private rebalanceEvaluated = 0;
  private rebalanceRejected = 0;

  // Quote age tracking
  private quoteAgeCount = 0;
  private quoteAgeTotalMs = 0;
  private quoteAgeMinMs = Infinity;
  private quoteAgeMaxMs = -Infinity;

  // Fee normalization tracking
  private feeNormCount = 0;
  private feeNormTotalBps = 0;
  private netEdgeTotalBps = 0;
  private feeNormMinBps = Infinity;
  private feeNormMaxBps = -Infinity;

  // Gross / fee / net USD tracking (for averages)
  private grossUsdTotal = 0;
  private executionFeeUsdTotal = 0;
  private netEdgeUsdTotal = 0;
  private tradeCount = 0;

  // Slippage cost tracking (separate count: not every gate eval yields an estimate)
  private slippageCostUsdTotal = 0;
  private slippageCostCount = 0;

  // Stage latency tracking
  private quoteLatency = newLatencyAccumulator();
  private swapBuildLatency = newLatencyAccumulator();

  // RPC health
  private rpcErrors = 0;
  private rpcRateLimited = 0;
  private rpcLatencyFailures = 0;

  // AI scoring funnel
  private aiScoringMode = 'unknown';
  private aiRequested = 0;
  private aiReturned = 0;
  private aiMissing = 0;
  private aiErrored = 0;
  private aiActionable = 0;
  private aiBelowConfidence = 0;

  // Venue / route observation
  private ammLabels: Record<string, number> = {};
  private routeTypes: Record<string, number> = {};

  // Best gross edge per pair (reset each summary interval)
  private bestGrossPerPair: Record<string, number> = {};
  private bestGrossOverall = 0;

  constructor(config?: Partial<SessionMetricsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Recording methods ──────────────────────────────────────────

  recordDiscovered(): void {
    this.discovered++;
  }

  /**
   * An opportunity was dropped before the execution gate ran.
   *
   * `reason` is normalised to a low-cardinality key so the report's
   * "top reject reasons" stays readable across a 72h run — raw skip strings
   * embed dollar amounts and mint addresses and would never group.
   */
  recordSkipped(reason: string): void {
    this.skipped++;
    const key = normaliseReason(reason);
    this.skipReasons[key] = (this.skipReasons[key] ?? 0) + 1;
  }

  recordQuoteRequested(): void {
    this.quotesRequested++;
  }

  recordQuoteFailed(): void {
    this.quoteFailures++;
  }

  recordQuoteLatency(ms: number): void {
    observeLatency(this.quoteLatency, ms);
  }

  recordSwapBuildAttempted(): void {
    this.swapBuildsAttempted++;
  }

  recordSwapBuildLatency(ms: number): void {
    observeLatency(this.swapBuildLatency, ms);
  }

  recordRpcError(kind: 'error' | 'rate_limited' | 'latency' = 'error'): void {
    if (kind === 'rate_limited') this.rpcRateLimited++;
    else if (kind === 'latency') this.rpcLatencyFailures++;
    else this.rpcErrors++;
  }

  /** Record the venue label and route shape observed on a quote. */
  recordRouteObservation(ammLabel: string, routeLegs: number): void {
    const label = ammLabel.trim() || 'unknown';
    this.ammLabels[label] = (this.ammLabels[label] ?? 0) + 1;
    const shape = routeLegs <= 1 ? 'direct' : `multihop_${routeLegs}`;
    this.routeTypes[shape] = (this.routeTypes[shape] ?? 0) + 1;
  }

  /** Record how scoring is configured, so the report can name it. */
  setAiScoringMode(mode: string): void {
    this.aiScoringMode = mode;
  }

  /**
   * Record one scoring attempt and its outcome.
   *
   * `actionable` is the scorer's own EXECUTE recommendation. It is recorded for
   * visibility only — it does not currently gate execution.
   */
  recordAiScore(outcome: 'scored' | 'unconfigured' | 'disabled' | 'error', actionable?: boolean): void {
    this.aiRequested++;
    if (outcome === 'scored') {
      this.aiReturned++;
      if (actionable) this.aiActionable++;
      else this.aiBelowConfidence++;
    } else if (outcome === 'error') {
      this.aiErrored++;
    } else {
      // 'unconfigured' and 'disabled' both mean no scorer was available.
      this.aiMissing++;
    }
  }

  recordSlippageCost(slippageCostUsd: number): void {
    if (!Number.isFinite(slippageCostUsd)) return;
    this.slippageCostUsdTotal += slippageCostUsd;
    this.slippageCostCount++;
  }

  recordGateEvaluated(): void {
    this.gateEvaluated++;
  }

  recordGatePassed(): void {
    this.gatePassed++;
  }

  recordGateRejected(reason: string): void {
    this.gateRejected++;
    this.rejectReasons[reason] = (this.rejectReasons[reason] ?? 0) + 1;
  }

  recordSwapBuilt(): void {
    this.swapsBuilt++;
  }

  recordSwapBuildFailed(): void {
    this.swapBuildFailed++;
  }

  recordSubmitted(): void {
    this.submitted++;
  }

  recordConfirmed(): void {
    this.confirmed++;
  }

  recordExpired(): void {
    this.expired++;
  }

  recordFailed(): void {
    this.failed++;
  }

  recordRebalanceEvaluated(): void {
    this.rebalanceEvaluated++;
  }

  recordRebalanceRejected(): void {
    this.rebalanceRejected++;
  }

  recordQuoteAge(ageMs: number): void {
    if (!Number.isFinite(ageMs) || ageMs < 0) return;
    this.quoteAgeCount++;
    this.quoteAgeTotalMs += ageMs;
    if (ageMs < this.quoteAgeMinMs) this.quoteAgeMinMs = ageMs;
    if (ageMs > this.quoteAgeMaxMs) this.quoteAgeMaxMs = ageMs;
  }

  recordFeeNormalization(notionalUsd: number, executionFeeUsd: number, netEdgeUsd: number): void {
    if (notionalUsd <= 0) return;
    const feeBps = (executionFeeUsd / notionalUsd) * 10_000;
    const edgeBps = (netEdgeUsd / notionalUsd) * 10_000;

    this.feeNormCount++;
    this.feeNormTotalBps += feeBps;
    this.netEdgeTotalBps += edgeBps;
    if (feeBps < this.feeNormMinBps) this.feeNormMinBps = feeBps;
    if (feeBps > this.feeNormMaxBps) this.feeNormMaxBps = feeBps;
  }

  recordTradeEconomics(grossUsd: number, executionFeeUsd: number, netEdgeUsd: number): void {
    this.grossUsdTotal += grossUsd;
    this.executionFeeUsdTotal += executionFeeUsd;
    this.netEdgeUsdTotal += netEdgeUsd;
    this.tradeCount++;
  }

  recordGrossEdge(pairLabel: string, grossUsd: number): void {
    if (grossUsd > (this.bestGrossPerPair[pairLabel] ?? 0)) {
      this.bestGrossPerPair[pairLabel] = grossUsd;
    }
    if (grossUsd > this.bestGrossOverall) {
      this.bestGrossOverall = grossUsd;
    }
  }

  // ── Snapshot / summary ─────────────────────────────────────────

  getFunnelSnapshot(): FunnelSnapshot {
    return {
      discovered: this.discovered,
      skipped: this.skipped,
      skipReasons: { ...this.skipReasons },
      quotesRequested: this.quotesRequested,
      quoteFailures: this.quoteFailures,
      swapBuildsAttempted: this.swapBuildsAttempted,
      gateEvaluated: this.gateEvaluated,
      gatePassed: this.gatePassed,
      gateRejected: this.gateRejected,
      rejectReasons: { ...this.rejectReasons },
      swapsBuilt: this.swapsBuilt,
      swapBuildFailed: this.swapBuildFailed,
      submitted: this.submitted,
      confirmed: this.confirmed,
      expired: this.expired,
      failed: this.failed,
      rebalanceEvaluated: this.rebalanceEvaluated,
      rebalanceRejected: this.rebalanceRejected,
    };
  }

  getSummary(): SessionSummary {
    const funnel = this.getFunnelSnapshot();
    const durationSec = (Date.now() - this.startedAt) / 1000;

    return {
      ...funnel,
      sessionDurationSec: +durationSec.toFixed(1),
      avgQuoteAgeMs: this.quoteAgeCount > 0
        ? +(this.quoteAgeTotalMs / this.quoteAgeCount).toFixed(1)
        : null,
      minQuoteAgeMs: this.quoteAgeCount > 0 ? this.quoteAgeMinMs : null,
      maxQuoteAgeMs: this.quoteAgeCount > 0 ? this.quoteAgeMaxMs : null,
      avgFeeBpsOfNotional: this.feeNormCount > 0
        ? +(this.feeNormTotalBps / this.feeNormCount).toFixed(2)
        : null,
      avgNetEdgeBpsOfNotional: this.feeNormCount > 0
        ? +(this.netEdgeTotalBps / this.feeNormCount).toFixed(2)
        : null,
      avgExpectedGrossUsd: this.tradeCount > 0
        ? +(this.grossUsdTotal / this.tradeCount).toFixed(6)
        : null,
      avgExecutionFeeUsd: this.tradeCount > 0
        ? +(this.executionFeeUsdTotal / this.tradeCount).toFixed(6)
        : null,
      avgNetEdgeUsd: this.tradeCount > 0
        ? +(this.netEdgeUsdTotal / this.tradeCount).toFixed(6)
        : null,
      avgSlippageCostUsd: this.slippageCostCount > 0
        ? +(this.slippageCostUsdTotal / this.slippageCostCount).toFixed(6)
        : null,
    };
  }

  /**
   * Full serializable snapshot for shadow reporting.
   *
   * Deliberately carries no signatures, wallet addresses, RPC URLs or API keys
   * — this object is written to disk and read by the report script.
   */
  getShadowSnapshot(): ShadowSnapshot {
    return {
      ...this.getSummary(),
      schemaVersion: 1,
      startedAtIso: new Date(this.startedAt).toISOString(),
      capturedAtIso: new Date().toISOString(),
      quoteLatency: summariseLatency(this.quoteLatency),
      swapBuildLatency: summariseLatency(this.swapBuildLatency),
      rpc: {
        errors: this.rpcErrors,
        rateLimited: this.rpcRateLimited,
        latencyFailures: this.rpcLatencyFailures,
      },
      aiScoringMode: this.aiScoringMode,
      ai: {
        requested: this.aiRequested,
        returned: this.aiReturned,
        missing: this.aiMissing,
        errored: this.aiErrored,
        actionable: this.aiActionable,
        belowConfidence: this.aiBelowConfidence,
      },
      ammLabels: { ...this.ammLabels },
      routeTypes: { ...this.routeTypes },
      bestGrossOverallUsd: +this.bestGrossOverall.toFixed(6),
      bestGrossPerPair: { ...this.bestGrossPerPair },
    };
  }

  // ── Periodic summary ───────────────────────────────────────────

  startPeriodicSummary(): void {
    if (this.summaryTimer) return;
    this.summaryTimer = setInterval(() => {
      this.emitSummary();
    }, this.config.summaryIntervalMs);
    // Don't block shutdown
    if (this.summaryTimer && typeof this.summaryTimer === 'object' && 'unref' in this.summaryTimer) {
      this.summaryTimer.unref();
    }
  }

  stopPeriodicSummary(): void {
    if (this.summaryTimer) {
      clearInterval(this.summaryTimer);
      this.summaryTimer = null;
    }
  }

  emitSummary(): void {
    const summary = this.getSummary();
    logger.info('[SESSION] periodic_summary', {
      ...summary,
      bestGrossOverallUsd: +this.bestGrossOverall.toFixed(6),
      bestGrossPerPair: { ...this.bestGrossPerPair },
      // Flatten reject reasons for structured logging
      ...Object.fromEntries(
        Object.entries(summary.rejectReasons).map(([k, v]) => [`reject_${k}`, v]),
      ),
    });
  }
}
