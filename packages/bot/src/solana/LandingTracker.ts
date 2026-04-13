/**
 * LandingTracker
 *
 * Tracks submitted → confirmed/expired/failed for Solana transactions.
 * Computes a rolling landing rate and optionally escalates priority fee
 * percentile when the rate drops below a warning threshold.
 */

import { Logger } from '../utils/Logger';

// ── Config ───────────────────────────────────────────────────────
export interface LandingTrackerConfig {
  /** Window size (max entries) for rolling statistics. */
  windowSize: number;
  /** Landing rate below which a warning is logged. */
  warningThreshold: number;
  /** If true, temporarily increase fee percentile on low landing rate. */
  autoEscalate: boolean;
  /** How many points to boost the percentile when escalating. */
  escalatePercentileBoost: number;
  /** Max percentile cap after escalation. */
  escalatePercentileCap: number;
}

export const DEFAULT_LANDING_TRACKER_CONFIG: LandingTrackerConfig = {
  windowSize: 50,
  warningThreshold: 0.70,
  autoEscalate: true,
  escalatePercentileBoost: 10,
  escalatePercentileCap: 95,
};

// ── Types ────────────────────────────────────────────────────────
export type TxOutcome = 'confirmed' | 'expired' | 'failed';

interface TxRecord {
  timestampMs: number;
  outcome: TxOutcome;
}

export interface LandingRateReport {
  windowSubmitted: number;
  windowConfirmed: number;
  windowExpired: number;
  windowFailed: number;
  landingRate: number;
  warningThreshold: number;
  escalated: boolean;
  currentPercentileBoost: number;
}

// ── Tracker ──────────────────────────────────────────────────────
export class LandingTracker {
  private readonly logger = new Logger('LandingTracker');
  private readonly config: LandingTrackerConfig;
  private readonly window: TxRecord[] = [];
  private escalated = false;
  private submissionsSinceLastReport = 0;

  constructor(config?: Partial<LandingTrackerConfig>) {
    this.config = { ...DEFAULT_LANDING_TRACKER_CONFIG, ...config };
  }

  /** Record a transaction outcome. */
  record(outcome: TxOutcome): void {
    this.window.push({ timestampMs: Date.now(), outcome });

    // Trim to window size
    while (this.window.length > this.config.windowSize) {
      this.window.shift();
    }

    this.submissionsSinceLastReport++;

    // Periodic report every 20 submissions
    if (this.submissionsSinceLastReport >= 20) {
      this.logReport();
      this.submissionsSinceLastReport = 0;
    }

    this.evaluateEscalation();
  }

  /** Get current landing rate statistics. */
  getReport(): LandingRateReport {
    const confirmed = this.window.filter((r) => r.outcome === 'confirmed').length;
    const expired = this.window.filter((r) => r.outcome === 'expired').length;
    const failed = this.window.filter((r) => r.outcome === 'failed').length;
    const total = this.window.length;

    return {
      windowSubmitted: total,
      windowConfirmed: confirmed,
      windowExpired: expired,
      windowFailed: failed,
      landingRate: total > 0 ? confirmed / total : 1,
      warningThreshold: this.config.warningThreshold,
      escalated: this.escalated,
      currentPercentileBoost: this.escalated ? this.config.escalatePercentileBoost : 0,
    };
  }

  /** Get the current percentile boost (0 if not escalated). */
  getPercentileBoost(): number {
    return this.escalated ? this.config.escalatePercentileBoost : 0;
  }

  /** Get the maximum percentile after escalation. */
  getEscalatePercentileCap(): number {
    return this.config.escalatePercentileCap;
  }

  /** Check if currently escalated. */
  isEscalated(): boolean {
    return this.escalated;
  }

  private evaluateEscalation(): void {
    if (!this.config.autoEscalate) return;

    // Need at least 10 submissions to evaluate
    if (this.window.length < 10) return;

    // Check last 10 submissions
    const recent = this.window.slice(-10);
    const recentConfirmed = recent.filter((r) => r.outcome === 'confirmed').length;
    const recentRate = recentConfirmed / recent.length;

    if (recentRate < this.config.warningThreshold && !this.escalated) {
      this.escalated = true;
      this.logger.warn('[LANDING] rate below threshold — escalating priority fee', {
        recentLandingRate: +recentRate.toFixed(3),
        warningThreshold: this.config.warningThreshold,
        percentileBoost: this.config.escalatePercentileBoost,
      });
    } else if (recentRate >= this.config.warningThreshold && this.escalated) {
      this.escalated = false;
      this.logger.info('[LANDING] rate recovered — de-escalating priority fee', {
        recentLandingRate: +recentRate.toFixed(3),
        warningThreshold: this.config.warningThreshold,
      });
    }
  }

  private logReport(): void {
    const report = this.getReport();
    const level = report.landingRate < this.config.warningThreshold ? 'warn' : 'info';

    this.logger[level]('[LANDING] landing_rate_report', {
      ...report,
      landingRate: +report.landingRate.toFixed(3),
    });
  }
}
