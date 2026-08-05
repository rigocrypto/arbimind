/**
 * ShadowReport tests.
 *
 * The report drives a money decision ("is this ready for a live canary?"), so
 * the important property is that it fails closed: thin, missing or unhealthy
 * evidence must never produce a canary recommendation.
 */

import { describe, it, expect } from 'vitest';
import {
  renderShadowReport,
  deriveRecommendation,
  READINESS,
} from '../../src/solana/ShadowReport';
import { SessionMetrics } from '../../src/solana/SessionMetrics';
import type { ShadowSnapshot } from '../../src/solana/SessionMetrics';

/** A snapshot that satisfies every readiness criterion. */
function healthySnapshot(overrides: Partial<ShadowSnapshot> = {}): ShadowSnapshot {
  const base = new SessionMetrics().getShadowSnapshot();
  return {
    ...base,
    sessionDurationSec: 30 * 3600,
    discovered: 5_000,
    skipped: 4_000,
    quotesRequested: 1_000,
    quoteFailures: 5,
    swapBuildsAttempted: 100,
    swapsBuilt: 100,
    swapBuildFailed: 0,
    gateEvaluated: 500,
    gatePassed: 100,
    gateRejected: 400,
    avgNetEdgeUsd: 0.15,
    submitted: 0,
    ...overrides,
  };
}

describe('deriveRecommendation', () => {
  describe('contaminated run disqualification', () => {
    it('returns "not ready" when any transaction was submitted', () => {
      // An otherwise perfect run: every readiness criterion met.
      const rec = deriveRecommendation(healthySnapshot({ submitted: 1 }));
      expect(rec.verdict).toBe('not ready');
      expect(rec.reasons.join(' ')).toContain('contaminated');
      expect(rec.reasons.join(' ')).toContain('SOLANA_LOG_ONLY was not true');
    });

    it('contamination outranks every other signal', () => {
      // Even a snapshot that would otherwise be the strongest possible case
      // must not reach a canary verdict once submissions are present.
      const perfect = healthySnapshot({
        sessionDurationSec: 72 * 3600,
        gateEvaluated: 5_000,
        gatePassed: 1_000,
        quoteFailures: 0,
        avgNetEdgeUsd: 5,
        submitted: 1,
      });
      expect(deriveRecommendation(perfect).verdict).toBe('not ready');
    });

    it('a single submission is enough to disqualify', () => {
      expect(deriveRecommendation(healthySnapshot({ submitted: 1 })).verdict).toBe('not ready');
      // ...and the clean control still passes, so the check is not vacuous.
      expect(deriveRecommendation(healthySnapshot({ submitted: 0 })).verdict).toBe(
        'ready for $1 canary',
      );
    });

    it('the rendered report both flags and disqualifies', () => {
      const report = renderShadowReport(healthySnapshot({ submitted: 4 }));
      expect(report).toContain('NOT LOG-ONLY');
      expect(report).toContain('NOT READY');
      // The two must never disagree: a flagged run cannot show a canary verdict.
      expect(report).not.toContain('READY FOR $1 CANARY');
    });
  });

  it('returns "not ready" when no quotes were requested', () => {
    const rec = deriveRecommendation(healthySnapshot({ quotesRequested: 0 }));
    expect(rec.verdict).toBe('not ready');
    expect(rec.reasons.join(' ')).toContain('no quotes');
  });

  it('returns "not ready" when the quote failure rate is too high', () => {
    const rec = deriveRecommendation(
      healthySnapshot({ quotesRequested: 1_000, quoteFailures: 200 }),
    );
    expect(rec.verdict).toBe('not ready');
    expect(rec.reasons.join(' ')).toContain('quote failure rate');
  });

  it('returns "not ready" when swap builds are unreliable', () => {
    const rec = deriveRecommendation(
      healthySnapshot({ swapBuildsAttempted: 100, swapsBuilt: 50, swapBuildFailed: 50 }),
    );
    expect(rec.verdict).toBe('not ready');
    expect(rec.reasons.join(' ')).toContain('swap build success rate');
  });

  it('returns "not ready" when RPC rate limiting is significant', () => {
    const rec = deriveRecommendation(
      healthySnapshot({ rpc: { errors: 0, rateLimited: 100, latencyFailures: 0 } }),
    );
    expect(rec.verdict).toBe('not ready');
    expect(rec.reasons.join(' ')).toContain('rate limiting');
  });

  it('returns "continue shadow" when the window is too short', () => {
    const rec = deriveRecommendation(healthySnapshot({ sessionDurationSec: 3 * 3600 }));
    expect(rec.verdict).toBe('continue shadow');
    expect(rec.reasons.join(' ')).toContain('under the');
  });

  it('returns "continue shadow" when there are too few gate evaluations', () => {
    const rec = deriveRecommendation(
      healthySnapshot({ gateEvaluated: 10, gatePassed: 5, gateRejected: 5 }),
    );
    expect(rec.verdict).toBe('continue shadow');
    expect(rec.reasons.join(' ')).toContain('gate evaluations');
  });

  it('returns "tune thresholds" when the gate rejects nearly everything', () => {
    const rec = deriveRecommendation(
      healthySnapshot({
        gateEvaluated: 500,
        gatePassed: 1,
        gateRejected: 499,
        rejectReasons: { 'execution_gate:net_profit_too_low': 499 },
      }),
    );
    expect(rec.verdict).toBe('tune thresholds');
    expect(rec.reasons.join(' ')).toContain('execution_gate:net_profit_too_low');
  });

  it('returns "tune thresholds" when passing trades are too marginal', () => {
    const rec = deriveRecommendation(healthySnapshot({ avgNetEdgeUsd: 0.001 }));
    expect(rec.verdict).toBe('tune thresholds');
    expect(rec.reasons.join(' ')).toContain('below the');
  });

  it('returns "tune thresholds" when net edge is unknown', () => {
    // A null average must never be read as "fine".
    const rec = deriveRecommendation(healthySnapshot({ avgNetEdgeUsd: null }));
    expect(rec.verdict).toBe('tune thresholds');
  });

  it('recommends a canary only when every criterion is met', () => {
    const rec = deriveRecommendation(healthySnapshot());
    expect(rec.verdict).toBe('ready for $1 canary');
    // Even the positive verdict must not read as an authorisation.
    expect(rec.reasons.join(' ')).toContain('not an authorisation');
  });

  it('a fresh, empty run is never ready', () => {
    const rec = deriveRecommendation(new SessionMetrics().getShadowSnapshot());
    expect(rec.verdict).toBe('not ready');
  });

  it('each individual criterion is load-bearing', () => {
    // Degrade one dimension at a time; none may still yield a canary verdict.
    const degradations: Array<Partial<ShadowSnapshot>> = [
      { sessionDurationSec: (READINESS.minWindowHours - 1) * 3600 },
      { gateEvaluated: READINESS.minGateEvaluations - 1 },
      { gatePassed: READINESS.minGatePassed - 1 },
      { swapBuildsAttempted: 100, swapsBuilt: 80, swapBuildFailed: 20 },
      { quotesRequested: 1_000, quoteFailures: 500 },
      { avgNetEdgeUsd: 0 },
    ];
    for (const degradation of degradations) {
      const rec = deriveRecommendation(healthySnapshot(degradation));
      expect(rec.verdict, `expected non-canary for ${JSON.stringify(degradation)}`).not.toBe(
        'ready for $1 canary',
      );
    }
  });
});

describe('renderShadowReport', () => {
  it('renders every required section', () => {
    const report = renderShadowReport(healthySnapshot());
    for (const section of [
      'SHADOW PERFORMANCE REPORT',
      'window:',
      'opportunities:',
      'quotes:',
      'swap builds:',
      'gate pass rate:',
      'top reject reasons:',
      'top AMMs:',
      'latency:',
      'expected economics:',
      'risk notes:',
      'recommendation:',
    ]) {
      expect(report).toContain(section);
    }
  });

  it('flags a run that submitted transactions as not log-only', () => {
    const report = renderShadowReport(healthySnapshot({ submitted: 3 }));
    expect(report).toContain('NOT LOG-ONLY');
  });

  it('does not flag a clean log-only run', () => {
    const report = renderShadowReport(healthySnapshot({ submitted: 0 }));
    expect(report).not.toContain('NOT LOG-ONLY');
  });

  it('renders an empty run without throwing', () => {
    const report = renderShadowReport(new SessionMetrics().getShadowSnapshot());
    expect(report).toContain('SHADOW PERFORMANCE REPORT');
    expect(report).toContain('NOT READY');
    expect(report).toContain('n/a');
  });

  it('contains no credential-shaped material', () => {
    const report = renderShadowReport(healthySnapshot());
    // The report is pasted into issues and PRs; it must carry no URLs or keys.
    expect(report).not.toMatch(/https?:\/\//);
    expect(report).not.toMatch(/api[-_]?key/i);
  });
});

describe('SessionMetrics reason normalisation', () => {
  it('collapses interpolated skip reasons into stable buckets', () => {
    const m = new SessionMetrics();
    m.recordSkipped('notional $4.13 exceeds max $5.00');
    m.recordSkipped('notional $9.90 exceeds max $5.00');
    m.recordSkipped('notional $1.01 exceeds max $5.00');

    const snap = m.getShadowSnapshot();
    // Three different dollar amounts, one bucket.
    expect(snap.skipReasons['notional_cap']).toBe(3);
    expect(Object.keys(snap.skipReasons)).toHaveLength(1);
  });

  it('keeps gate sub-reasons distinct', () => {
    const m = new SessionMetrics();
    m.recordSkipped('execution gate: net_profit_too_low');
    m.recordSkipped('execution gate: edge_bps_too_low');

    const snap = m.getShadowSnapshot();
    expect(Object.keys(snap.skipReasons).sort()).toEqual([
      'execution_gate:edge_bps_too_low',
      'execution_gate:net_profit_too_low',
    ]);
  });

  it('records route shapes and AMM labels', () => {
    const m = new SessionMetrics();
    m.recordRouteObservation('Whirlpool', 1);
    m.recordRouteObservation('Whirlpool', 1);
    m.recordRouteObservation('Raydium CLMM', 2);

    const snap = m.getShadowSnapshot();
    expect(snap.ammLabels).toEqual({ 'Whirlpool': 2, 'Raydium CLMM': 1 });
    expect(snap.routeTypes).toEqual({ direct: 2, multihop_2: 1 });
  });

  it('ignores non-finite and negative latencies', () => {
    const m = new SessionMetrics();
    m.recordQuoteLatency(100);
    m.recordQuoteLatency(-5);
    m.recordQuoteLatency(Number.NaN);

    const snap = m.getShadowSnapshot();
    expect(snap.quoteLatency.count).toBe(1);
    expect(snap.quoteLatency.avgMs).toBe(100);
  });
});
