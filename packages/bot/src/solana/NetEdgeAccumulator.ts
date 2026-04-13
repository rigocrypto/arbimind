/**
 * NetEdgeAccumulator
 *
 * Rolling-window accumulator for per-trade economics:
 * gross profit, execution fee, slippage cost, net edge.
 *
 * Derives a sticky trade-size floor from observed cost data.
 * The floor can only move upward automatically — downward movement
 * requires an explicit config change or bot restart.
 */

import { Logger } from '../utils/Logger';

// ── Config ───────────────────────────────────────────────────────
export interface NetEdgeAccumulatorConfig {
  /** Rolling window size (number of confirmed trades). Default 20. */
  windowSize: number;
  /** Configured minimum trade USD (from InventoryConfig). Used as absolute floor. */
  configuredMinTradeUsd: number;
  /** Safety multiplier above break-even for sticky floor. Default 1.5. */
  stickyFloorMultiplier: number;
}

export const DEFAULT_NET_EDGE_ACCUMULATOR_CONFIG: NetEdgeAccumulatorConfig = {
  windowSize: 20,
  configuredMinTradeUsd: 20,
  stickyFloorMultiplier: 1.5,
};

// ── Types ────────────────────────────────────────────────────────
export interface TradeEdgeRecord {
  grossUsd: number;
  executionFeeUsd: number;
  slippageCostUsd: number;
  netEdgeUsd: number;
  timestampMs: number;
}

export interface NetEdgeWindowReport {
  windowSize: number;
  tradeCount: number;
  avgGrossUsd: number;
  avgExecutionFeeUsd: number;
  avgSlippageCostUsd: number;
  avgNetEdgeUsd: number;
  feeDragRatio: number;
  netEdgeRatio: number;
  observedMinNetEdgeUsd: number;
  observedMaxNetEdgeUsd: number;
}

// ── Accumulator ──────────────────────────────────────────────────
export class NetEdgeAccumulator {
  private readonly logger = new Logger('NetEdgeAccumulator');
  private readonly config: NetEdgeAccumulatorConfig;
  private readonly window: TradeEdgeRecord[] = [];
  private stickyMinTradeUsd: number;
  private tradesSinceLastReport = 0;

  constructor(config?: Partial<NetEdgeAccumulatorConfig>) {
    this.config = { ...DEFAULT_NET_EDGE_ACCUMULATOR_CONFIG, ...config };
    this.stickyMinTradeUsd = this.config.configuredMinTradeUsd;
  }

  /** Record a confirmed trade's economics. */
  record(trade: Omit<TradeEdgeRecord, 'timestampMs'>): void {
    const record: TradeEdgeRecord = {
      ...trade,
      timestampMs: Date.now(),
    };

    this.window.push(record);
    while (this.window.length > this.config.windowSize) {
      this.window.shift();
    }

    this.tradesSinceLastReport++;
    this.updateStickyFloor();

    // Report every 10 confirmed trades
    if (this.tradesSinceLastReport >= 10) {
      this.logReport();
      this.tradesSinceLastReport = 0;
    }
  }

  /** Get current window report. */
  getReport(): NetEdgeWindowReport {
    const n = this.window.length;
    if (n === 0) {
      return {
        windowSize: this.config.windowSize,
        tradeCount: 0,
        avgGrossUsd: 0,
        avgExecutionFeeUsd: 0,
        avgSlippageCostUsd: 0,
        avgNetEdgeUsd: 0,
        feeDragRatio: 0,
        netEdgeRatio: 0,
        observedMinNetEdgeUsd: 0,
        observedMaxNetEdgeUsd: 0,
      };
    }

    const sumGross = this.window.reduce((s, t) => s + t.grossUsd, 0);
    const sumFee = this.window.reduce((s, t) => s + t.executionFeeUsd, 0);
    const sumSlippage = this.window.reduce((s, t) => s + t.slippageCostUsd, 0);
    const sumNet = this.window.reduce((s, t) => s + t.netEdgeUsd, 0);

    const avgGross = sumGross / n;
    const avgFee = sumFee / n;
    const avgSlippage = sumSlippage / n;
    const avgNet = sumNet / n;

    const netEdges = this.window.map((t) => t.netEdgeUsd);

    return {
      windowSize: this.config.windowSize,
      tradeCount: n,
      avgGrossUsd: +avgGross.toFixed(6),
      avgExecutionFeeUsd: +avgFee.toFixed(6),
      avgSlippageCostUsd: +avgSlippage.toFixed(6),
      avgNetEdgeUsd: +avgNet.toFixed(6),
      feeDragRatio: avgGross > 0 ? +(avgFee / avgGross).toFixed(4) : 0,
      netEdgeRatio: avgGross > 0 ? +(avgNet / avgGross).toFixed(4) : 0,
      observedMinNetEdgeUsd: +Math.min(...netEdges).toFixed(6),
      observedMaxNetEdgeUsd: +Math.max(...netEdges).toFixed(6),
    };
  }

  /** Get the current sticky minimum trade size. */
  getStickyMinTradeUsd(): number {
    return this.stickyMinTradeUsd;
  }

  private updateStickyFloor(): void {
    if (this.window.length < 5) return; // Need some data before adjusting

    const report = this.getReport();

    // Compute break-even notional: (avgFee + avgSlippage) / netEdgeRatio
    // Only raise the floor, never lower it
    if (report.netEdgeRatio > 0) {
      const breakEvenNotionalUsd =
        (report.avgExecutionFeeUsd + report.avgSlippageCostUsd) / report.netEdgeRatio;
      const proposedFloor = breakEvenNotionalUsd * this.config.stickyFloorMultiplier;
      const newFloor = Math.max(this.config.configuredMinTradeUsd, proposedFloor);

      if (newFloor > this.stickyMinTradeUsd) {
        const previous = this.stickyMinTradeUsd;
        this.stickyMinTradeUsd = +newFloor.toFixed(2);

        this.logger.info('[NET_EDGE] sticky_floor_updated', {
          previous,
          updated: this.stickyMinTradeUsd,
          breakEvenEstimateUsd: +breakEvenNotionalUsd.toFixed(2),
          configuredMinTradeUsd: this.config.configuredMinTradeUsd,
          reason: 'observed_cost_increase',
        });
      }
    }

    // Warning if average net edge is negative
    if (report.avgNetEdgeUsd < 0 && this.window.length >= 10) {
      this.logger.warn('[NET_EDGE] average net edge is negative over window', {
        avgNetEdgeUsd: report.avgNetEdgeUsd,
        tradeCount: report.tradeCount,
      });
    }

    // Suggestion if minNetProfitUsd floor could be raised
    // (This is advisory only — no automatic change)
  }

  private logReport(): void {
    const report = this.getReport();
    this.logger.info('[NET_EDGE] net_edge_window_report', report);
  }
}
