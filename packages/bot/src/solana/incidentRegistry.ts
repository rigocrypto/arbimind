/**
 * Solana Venue Incident Registry
 *
 * Time-bounded incident intelligence for known DEX venues.
 * Each entry represents a specific security event with status tracking.
 * Incidents expire based on cooldown logic — they are NOT permanent bans.
 *
 * evaluateVenueRisk() merges baseline venue profile + incident override + env policy.
 */

export type IncidentType =
  | 'governance_compromise'
  | 'code_exploit'
  | 'oracle_attack'
  | 'insider'
  | 'mev';

export type IncidentStatus =
  | 'active'       // ongoing, unresolved
  | 'contained'    // bleeding stopped, forensics ongoing
  | 'monitoring'   // resolved but under observation
  | 'resolved';    // fully resolved, no longer operationally relevant

export interface VenueIncident {
  venue: string;
  incidentId: string;           // unique key, e.g. 'drift-2026-04-01-gov'
  startedAt: string;            // ISO date
  severity: 'medium' | 'high' | 'critical';
  type: IncidentType;
  status: IncidentStatus;
  policyOverride?: 'deny' | 'canary';
  notes?: string;
  sourceUrls?: string[];
  reviewDate: string;           // ISO date — forces periodic reassessment
}

export const INCIDENT_REGISTRY: VenueIncident[] = [
  {
    venue: 'Drift',
    incidentId: 'drift-2026-04-01-gov',
    startedAt: '2026-04-01',
    severity: 'critical',
    type: 'governance_compromise',
    status: 'contained',
    policyOverride: 'deny',
    notes:
      '$285M governance compromise. DPRK-linked social engineering of 2/5 multisig signers. ' +
      'Admin key takeover (not code bug). Protocol paused; forensics ongoing.',
    sourceUrls: [
      'https://x.com/DriftProtocol/status/1907000000000000000',
    ],
    reviewDate: '2026-05-01',
  },
];

const incidentMap = new Map<string, VenueIncident[]>();
for (const incident of INCIDENT_REGISTRY) {
  const key = incident.venue.toLowerCase();
  const existing = incidentMap.get(key) ?? [];
  existing.push(incident);
  incidentMap.set(key, existing);
}

/**
 * Returns all incidents for a venue, most recent first.
 * Returns empty array if no incidents on record.
 */
export function getVenueIncidents(venueLabel: string): VenueIncident[] {
  const incidents = incidentMap.get(venueLabel.toLowerCase()) ?? [];
  return incidents.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

/**
 * Returns the most severe *active* incident (active or contained) for a venue,
 * or undefined if no active incidents exist.
 */
export function getActiveIncident(venueLabel: string): VenueIncident | undefined {
  const incidents = getVenueIncidents(venueLabel);
  return incidents.find(
    (i) => i.status === 'active' || i.status === 'contained',
  );
}

/**
 * Check if a venue is within the cooldown window for any incident of the
 * specified types. Cooldown is measured from `startedAt`.
 */
export function isWithinCooldown(
  venueLabel: string,
  cooldownDays: number,
  denyIncidentTypes: IncidentType[],
  now: Date = new Date(),
): VenueIncident | undefined {
  if (cooldownDays <= 0 || denyIncidentTypes.length === 0) return undefined;

  const incidents = getVenueIncidents(venueLabel);
  const cutoff = now.getTime() - cooldownDays * 86_400_000;

  return incidents.find(
    (i) =>
      denyIncidentTypes.includes(i.type) &&
      new Date(i.startedAt).getTime() >= cutoff &&
      (i.status === 'active' || i.status === 'contained' || i.status === 'monitoring'),
  );
}
