/**
 * Solana Risk Policy Engine
 *
 * Evaluates venue risk profiles against configurable policy thresholds
 * and returns an execution decision (deny / canary / penalize / allow).
 */

import type { RiskTier, VenueRiskProfile } from './venueRisk';

export interface RiskPolicyConfig {
  denyTiers: RiskTier[];        // tiers that hard-block execution
  canaryTiers: RiskTier[];      // tiers forced to canary notional
  canaryMaxNotionalUsd: number; // max notional for canary-tier venues
  minEdgeBumpBps: number;       // additional min-edge bps for medium-risk venues
}

export interface RiskDecision {
  action: 'deny' | 'canary' | 'penalize' | 'allow';
  reason: string;
  effectiveMaxNotionalUsd?: number;
  effectiveMinEdgeBps?: number;
}

export function evaluateVenueRisk(
  profile: VenueRiskProfile,
  baseNotionalUsd: number,
  baseMinEdgeBps: number,
  policy: RiskPolicyConfig,
): RiskDecision {
  if (policy.denyTiers.includes(profile.riskTier)) {
    return {
      action: 'deny',
      reason: `venue risk tier: ${profile.riskTier}`,
    };
  }

  if (policy.canaryTiers.includes(profile.riskTier)) {
    return {
      action: 'canary',
      reason: `venue risk tier: ${profile.riskTier} — canary cap`,
      effectiveMaxNotionalUsd: policy.canaryMaxNotionalUsd,
    };
  }

  if (profile.riskTier === 'medium') {
    return {
      action: 'penalize',
      reason: `venue risk tier: medium — edge bump +${policy.minEdgeBumpBps}bps`,
      effectiveMinEdgeBps: baseMinEdgeBps + policy.minEdgeBumpBps,
    };
  }

  return { action: 'allow', reason: 'venue risk tier: low' };
}
