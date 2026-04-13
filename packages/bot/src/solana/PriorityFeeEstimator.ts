/**
 * PriorityFeeEstimator
 *
 * Queries `getRecentPrioritizationFees` from the Solana RPC and returns
 * a recommended maxLamports value for Jupiter's structured
 * prioritizationFeeLamports field.
 *
 * - Fetches recent fees for the writable accounts involved in the swap.
 * - Takes the configured percentile (default 75th) of non-zero fees.
 * - Clamps to [floor, cap] range (default: 10 000 – 5 000 000 lamports).
 * - Caches the estimate for a short TTL to avoid per-swap RPC spam.
 * - Falls back to a static default on any failure.
 */

import { Connection, type PublicKey } from '@solana/web3.js';
import { Logger } from '../utils/Logger';

// ── Config ───────────────────────────────────────────────────────
export interface PriorityFeeConfig {
  /** Enable dynamic fee lookup. When false, always returns staticDefault. */
  enabled: boolean;
  /** Percentile of recent slot fees to target (0–100). Default 75. */
  percentile: number;
  /** Minimum maxLamports to ever request. Default 10 000 (0.00001 SOL). */
  floorLamports: number;
  /** Maximum maxLamports cap. Default 5 000 000 (0.005 SOL). */
  capLamports: number;
  /** Static fallback when dynamic lookup fails or is disabled. */
  staticDefaultLamports: number;
  /** How long (ms) a cached estimate stays fresh. Default 10 000 (10 s). */
  cacheTtlMs: number;
}

export const DEFAULT_PRIORITY_FEE_CONFIG: PriorityFeeConfig = {
  enabled: true,
  percentile: 75,
  floorLamports: 10_000,
  capLamports: 5_000_000,
  staticDefaultLamports: 1_000_000,
  cacheTtlMs: 10_000,
};

// ── Result ───────────────────────────────────────────────────────
export interface PriorityFeeEstimate {
  maxLamports: number;
  priorityLevel: 'low' | 'medium' | 'high' | 'veryHigh';
  source: 'dynamic' | 'cached' | 'static-fallback';
  sampleCount: number;
  percentile: number;
  rawPercentileValue: number;
}

// ── Estimator ────────────────────────────────────────────────────
export class PriorityFeeEstimator {
  private readonly logger = new Logger('PriorityFeeEstimator');
  private readonly config: PriorityFeeConfig;

  private cachedEstimate: PriorityFeeEstimate | null = null;
  private cachedAtMs = 0;

  constructor(config?: Partial<PriorityFeeConfig>) {
    this.config = { ...DEFAULT_PRIORITY_FEE_CONFIG, ...config };
  }

  /**
   * Get the recommended maxLamports for the next swap.
   *
   * @param connection  Active Solana RPC connection
   * @param writableAccounts  Writable accounts from the swap (optional —
   *   when omitted the RPC returns global recent fees)
   */
  async estimate(
    connection: Connection,
    writableAccounts?: PublicKey[],
  ): Promise<PriorityFeeEstimate> {
    if (!this.config.enabled) {
      return this.staticFallback(0);
    }

    // Return cache if still fresh
    if (this.cachedEstimate && Date.now() - this.cachedAtMs < this.config.cacheTtlMs) {
      return { ...this.cachedEstimate, source: 'cached' };
    }

    try {
      const fees = await connection.getRecentPrioritizationFees(
        writableAccounts ? { lockedWritableAccounts: writableAccounts } : undefined,
      );

      // Filter to non-zero fees (zero = base fee only, not useful for percentile)
      const nonZero = fees
        .map((f) => f.prioritizationFee)
        .filter((f) => f > 0)
        .sort((a, b) => a - b);

      if (nonZero.length === 0) {
        this.logger.debug('[PRIORITY_FEE] no non-zero fees in recent slots, using floor', {
          totalSlots: fees.length,
        });
        return this.clampAndCache(this.config.floorLamports, 0, 'dynamic', fees.length);
      }

      const idx = Math.min(
        Math.floor((this.config.percentile / 100) * nonZero.length),
        nonZero.length - 1,
      );
      const rawValue = nonZero[idx];

      this.logger.debug('[PRIORITY_FEE] estimated from recent slots', {
        sampleCount: nonZero.length,
        totalSlots: fees.length,
        percentile: this.config.percentile,
        rawPercentileValue: rawValue,
        floor: this.config.floorLamports,
        cap: this.config.capLamports,
      });

      return this.clampAndCache(rawValue, rawValue, 'dynamic', nonZero.length);
    } catch (err) {
      this.logger.warn('[PRIORITY_FEE] RPC lookup failed, using static fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.staticFallback(0);
    }
  }

  /** Derive a priority level label from the clamped value relative to config range. */
  private derivePriorityLevel(lamports: number): 'low' | 'medium' | 'high' | 'veryHigh' {
    const range = this.config.capLamports - this.config.floorLamports;
    if (range <= 0) return 'medium';
    const ratio = (lamports - this.config.floorLamports) / range;
    if (ratio < 0.25) return 'low';
    if (ratio < 0.5) return 'medium';
    if (ratio < 0.75) return 'high';
    return 'veryHigh';
  }

  private clampAndCache(
    rawLamports: number,
    rawPercentileValue: number,
    source: 'dynamic' | 'static-fallback',
    sampleCount: number,
  ): PriorityFeeEstimate {
    const clamped = Math.max(
      this.config.floorLamports,
      Math.min(rawLamports, this.config.capLamports),
    );

    const estimate: PriorityFeeEstimate = {
      maxLamports: clamped,
      priorityLevel: this.derivePriorityLevel(clamped),
      source,
      sampleCount,
      percentile: this.config.percentile,
      rawPercentileValue,
    };

    this.cachedEstimate = estimate;
    this.cachedAtMs = Date.now();
    return estimate;
  }

  private staticFallback(sampleCount: number): PriorityFeeEstimate {
    return this.clampAndCache(
      this.config.staticDefaultLamports,
      0,
      'static-fallback',
      sampleCount,
    );
  }

  /** Expose config for diagnostics. */
  getConfig(): Readonly<PriorityFeeConfig> {
    return this.config;
  }
}
