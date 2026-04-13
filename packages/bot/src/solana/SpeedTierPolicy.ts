/**
 * SpeedTierPolicy
 *
 * Maps speed tier names to execution parameters: priority fee percentile,
 * cache TTL, minimum net profit, and risk buffer.
 *
 * Priority hierarchy:
 *   explicit env var > tier default > compiled default
 */

import { Logger } from '../utils/Logger';

// ── Types ────────────────────────────────────────────────────────
export type SpeedTier = 'standard' | 'priority' | 'ultra';

export interface TierPolicy {
  priorityFeePercentile: number;
  cacheTtlMs: number;
  minNetProfitUsd: number;
  riskBufferUsd: number;
}

export interface SpeedTierConfig {
  tier: SpeedTier;
  overrides: Partial<TierPolicy>;
}

// ── Defaults per tier ────────────────────────────────────────────
const TIER_DEFAULTS: Record<SpeedTier, TierPolicy> = {
  standard: {
    priorityFeePercentile: 50,
    cacheTtlMs: 12_000,
    minNetProfitUsd: 0.10,
    riskBufferUsd: 0.05,
  },
  priority: {
    priorityFeePercentile: 75,
    cacheTtlMs: 6_000,
    minNetProfitUsd: 0.08,
    riskBufferUsd: 0.03,
  },
  ultra: {
    priorityFeePercentile: 90,
    cacheTtlMs: 3_000,
    minNetProfitUsd: 0.06,
    riskBufferUsd: 0.02,
  },
};

const VALID_TIERS = new Set<string>(['standard', 'priority', 'ultra']);

// ── Resolve effective policy ─────────────────────────────────────
export function resolveSpeedTierPolicy(config: SpeedTierConfig): TierPolicy {
  const logger = new Logger('SpeedTierPolicy');

  let tier = config.tier;
  if (!VALID_TIERS.has(tier)) {
    logger.warn('[SPEED_TIER] unknown tier, falling back to priority', {
      provided: tier,
      fallback: 'priority',
    });
    tier = 'priority';
  }

  const defaults = TIER_DEFAULTS[tier];
  const policy: TierPolicy = {
    priorityFeePercentile: config.overrides.priorityFeePercentile ?? defaults.priorityFeePercentile,
    cacheTtlMs: config.overrides.cacheTtlMs ?? defaults.cacheTtlMs,
    minNetProfitUsd: config.overrides.minNetProfitUsd ?? defaults.minNetProfitUsd,
    riskBufferUsd: config.overrides.riskBufferUsd ?? defaults.riskBufferUsd,
  };

  logger.info('[SPEED_TIER] resolved policy', {
    speedTier: tier,
    ...policy,
  });

  return policy;
}

export function parseSpeedTier(value: string | undefined): SpeedTier {
  const normalized = (value || '').trim().toLowerCase();
  if (VALID_TIERS.has(normalized)) return normalized as SpeedTier;
  return 'priority';
}

export function getTierDefaults(tier: SpeedTier): Readonly<TierPolicy> {
  return TIER_DEFAULTS[tier] ?? TIER_DEFAULTS.priority;
}
