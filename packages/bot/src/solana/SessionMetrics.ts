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
}

// ── Config ─────────────────────────────────────────────────────────

export interface SessionMetricsConfig {
  /** How often to emit a summary log (ms). Default: 600_000 (10 min). */
  summaryIntervalMs: number;
}

const DEFAULT_CONFIG: SessionMetricsConfig = {
  summaryIntervalMs: 600_000,
};

// ── Class ──────────────────────────────────────────────────────────

export class SessionMetrics {
  private readonly config: SessionMetricsConfig;
  private readonly startedAt = Date.now();
  private summaryTimer: ReturnType<typeof setInterval> | null = null;

  // Funnel counters
  private discovered = 0;
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

  constructor(config?: Partial<SessionMetricsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Recording methods ──────────────────────────────────────────

  recordDiscovered(): void {
    this.discovered++;
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

  // ── Snapshot / summary ─────────────────────────────────────────

  getFunnelSnapshot(): FunnelSnapshot {
    return {
      discovered: this.discovered,
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
      // Flatten reject reasons for structured logging
      ...Object.fromEntries(
        Object.entries(summary.rejectReasons).map(([k, v]) => [`reject_${k}`, v]),
      ),
    });
  }
}
