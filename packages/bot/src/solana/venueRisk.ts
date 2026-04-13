/**
 * Solana Venue Risk Registry
 *
 * Structured risk profiles for known DEX venues.
 * Unknown venues default to high risk.
 * All profiles require a reviewDate for periodic reassessment.
 */

export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

export interface VenueRiskProfile {
  venue: string;
  riskTier: RiskTier;
  mevRisk: number;            // 0–1
  governanceRisk: number;     // 0–1
  exploitHistoryRisk: number; // 0–1
  auditRisk: number;          // 0–1
  notes?: string;
  sourceUrls?: string[];
  reviewDate: string;         // ISO date — forces periodic review
}

export const VENUE_RISK_REGISTRY: VenueRiskProfile[] = [
  {
    venue: 'Raydium CLMM',
    riskTier: 'medium',
    mevRisk: 0.6,
    governanceRisk: 0.3,
    exploitHistoryRisk: 0.2,
    auditRisk: 0.2,
    notes: 'High MEV exposure on Jupiter routes; sandwich-prone pools',
    reviewDate: '2026-04-13',
  },
  {
    venue: 'Whirlpool',
    riskTier: 'low',
    mevRisk: 0.3,
    governanceRisk: 0.2,
    exploitHistoryRisk: 0.1,
    auditRisk: 0.1,
    notes: 'Orca Whirlpool — audited, stable governance',
    reviewDate: '2026-04-13',
  },
  {
    venue: 'Meteora DLMM',
    riskTier: 'medium',
    mevRisk: 0.4,
    governanceRisk: 0.4,
    exploitHistoryRisk: 0.1,
    auditRisk: 0.3,
    notes: 'Newer protocol, less exploit history but governance less mature',
    reviewDate: '2026-04-13',
  },
  {
    venue: 'Drift',
    riskTier: 'critical',
    mevRisk: 0.5,
    governanceRisk: 1.0,
    exploitHistoryRisk: 1.0,
    auditRisk: 0.4,
    notes: '$285M governance compromise (2026-04-01). DPRK-linked social engineering of 2/5 multisig signers. Admin key takeover, not code bug. Protocol paused; forensics ongoing.',
    sourceUrls: [
      'https://x.com/DriftProtocol/status/1907000000000000000',
    ],
    reviewDate: '2026-04-13',
  },
];

export const DEFAULT_UNKNOWN_VENUE_RISK: VenueRiskProfile = {
  venue: 'unknown',
  riskTier: 'high',
  mevRisk: 0.8,
  governanceRisk: 0.8,
  exploitHistoryRisk: 0.5,
  auditRisk: 0.8,
  notes: 'Unrecognized venue — default high risk',
  reviewDate: '2026-04-13',
};

const registryMap = new Map<string, VenueRiskProfile>(
  VENUE_RISK_REGISTRY.map((p) => [p.venue.toLowerCase(), p]),
);

export function getVenueRisk(venueLabel: string): VenueRiskProfile {
  return registryMap.get(venueLabel.toLowerCase()) ?? DEFAULT_UNKNOWN_VENUE_RISK;
}
