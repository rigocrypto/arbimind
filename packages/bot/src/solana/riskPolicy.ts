/**
 * Solana Risk Policy Engine
 *
 * Evaluates venue risk profiles against configurable policy thresholds
 * and returns an execution decision (deny / canary / penalize / allow).
 *
 * Evaluation order:
 *   1. Incident cooldown check (time-bounded deny/canary override)
 *   2. Active incident policyOverride (deny/canary from registry)
 *   3. Baseline tier-based policy (denyTiers / canaryTiers / penalize / allow)
 */

import type { RiskTier, VenueRiskProfile } from './venueRisk';
import type { IncidentType } from './incidentRegistry';
import { getActiveIncident, isWithinCooldown } from './incidentRegistry';

export interface RiskPolicyConfig {
  denyTiers: RiskTier[];        // tiers that hard-block execution
  canaryTiers: RiskTier[];      // tiers forced to canary notional
  canaryMaxNotionalUsd: number; // max notional for canary-tier venues
  minEdgeBumpBps: number;       // additional min-edge bps for medium-risk venues
  incidentCooldownDays: number; // deny/canary window after a qualifying incident
  denyIncidentTypes: IncidentType[];  // incident types that trigger cooldown deny
}

export interface RiskDecision {
  action: 'deny' | 'canary' | 'penalize' | 'allow';
  reason: string;
  incidentId?: string;
  effectiveMaxNotionalUsd?: number;
  effectiveMinEdgeBps?: number;
}

export function evaluateVenueRisk(
  profile: VenueRiskProfile,
  baseNotionalUsd: number,
  baseMinEdgeBps: number,
  policy: RiskPolicyConfig,
): RiskDecision {
  // 1. Incident cooldown — time-bounded deny for qualifying incident types
  const cooldownHit = isWithinCooldown(
    profile.venue,
    policy.incidentCooldownDays,
    policy.denyIncidentTypes,
  );
  if (cooldownHit) {
    return {
      action: 'deny',
      reason: `incident cooldown: ${cooldownHit.type} (${cooldownHit.incidentId}) — ${cooldownHit.status}`,
      incidentId: cooldownHit.incidentId,
    };
  }

  // 2. Active incident with explicit policyOverride
  const activeIncident = getActiveIncident(profile.venue);
  if (activeIncident?.policyOverride === 'deny') {
    return {
      action: 'deny',
      reason: `active incident override: ${activeIncident.type} (${activeIncident.incidentId})`,
      incidentId: activeIncident.incidentId,
    };
  }
  if (activeIncident?.policyOverride === 'canary') {
    return {
      action: 'canary',
      reason: `active incident override: ${activeIncident.type} (${activeIncident.incidentId}) — canary cap`,
      incidentId: activeIncident.incidentId,
      effectiveMaxNotionalUsd: policy.canaryMaxNotionalUsd,
    };
  }

  // 3. Baseline tier-based policy
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
