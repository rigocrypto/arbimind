/**
 * AI scoring mode tests.
 *
 * The scanner gates every opportunity on a score existing, so an unconfigured
 * scorer silently zeroes the entire executor funnel. These tests exist to prove
 * that failure is now loud, and that the local mode actually produces a score.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { AiScoringService } from '../../src/services/AiScoringService';
import { resolveAiScoringMode } from '../../src/config';
import { SessionMetrics } from '../../src/solana/SessionMetrics';
import { deriveRecommendation, renderShadowReport } from '../../src/solana/ShadowReport';
import type { ArbitrageOpportunity } from '../../src/types';

const opportunity = {
  tokenA: 'SOL',
  tokenB: 'USDC',
  dex1: 'RAYDIUM',
  dex2: 'RAYDIUM',
  amountIn: '1000000000',
  amountOut1: '0',
  amountOut2: '0',
  profit: '0',
  profitPercent: 0.8,
  gasEstimate: '0',
  netProfit: '0',
  decimalsIn: 9,
  decimalsOut: 6,
  route: 'SOLANA',
  timestamp: Date.now(),
} as unknown as ArbitrageOpportunity;

const context = {
  chain: 'solana' as const,
  pairAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
  volumeUsd: 71_000_000,
  liquidityUsd: 25_000_000,
};

describe('resolveAiScoringMode', () => {
  it('defaults to remote when a predict URL is configured', () => {
    expect(resolveAiScoringMode(undefined, 'https://predict.invalid/score')).toBe('remote');
  });

  it('defaults to disabled when no predict URL is configured', () => {
    // Preserves prior behaviour: local must be opted into, never assumed.
    expect(resolveAiScoringMode(undefined, undefined)).toBe('disabled');
    expect(resolveAiScoringMode(undefined, '')).toBe('disabled');
  });

  it('honours an explicit mode over the URL-derived default', () => {
    expect(resolveAiScoringMode('local', 'https://predict.invalid/score')).toBe('local');
    expect(resolveAiScoringMode('disabled', 'https://predict.invalid/score')).toBe('disabled');
    expect(resolveAiScoringMode('remote', undefined)).toBe('remote');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(resolveAiScoringMode('  LOCAL  ', undefined)).toBe('local');
  });

  it('falls back to the URL-derived default on an unrecognised value', () => {
    expect(resolveAiScoringMode('bogus', 'https://predict.invalid/score')).toBe('remote');
    expect(resolveAiScoringMode('bogus', undefined)).toBe('disabled');
  });
});

describe('AiScoringService outcomes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports scorer unavailable when mode=remote with no URL', async () => {
    const svc = new AiScoringService({ mode: 'remote' });
    const result = await svc.scoreOpportunityWithOutcome(opportunity, context);

    expect(result.outcome).toBe('unconfigured');
    expect(result.score).toBeNull();
    expect(result.reason).toContain('AI_PREDICT_URL');
  });

  it('reports disabled explicitly rather than returning a bare null', async () => {
    const svc = new AiScoringService({ mode: 'disabled' });
    const result = await svc.scoreOpportunityWithOutcome(opportunity, context);

    expect(result.outcome).toBe('disabled');
    expect(result.score).toBeNull();
    // The distinction that matters: this is not "the model declined".
    expect(result.reason).toContain('disabled');
  });

  it('mode=local produces a score with no HTTP service configured', async () => {
    // No fetch stub at all — a network call here would throw.
    const svc = new AiScoringService({ mode: 'local' });
    const result = await svc.scoreOpportunityWithOutcome(opportunity, context);

    expect(result.outcome).toBe('scored');
    expect(result.score).not.toBeNull();
    expect(result.score!.successProb).toBeGreaterThan(0);
    expect(result.score!.successProb).toBeLessThanOrEqual(1);
    expect(['EXECUTE', 'WAIT']).toContain(result.score!.recommendation);
  });

  it('mode=local preserves the opportunity profit percentage', async () => {
    const svc = new AiScoringService({ mode: 'local' });
    const result = await svc.scoreOpportunityWithOutcome(opportunity, context);
    expect(result.score!.expectedProfitPct).toBe(0.8);
  });

  it('mode=local does not issue any network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const svc = new AiScoringService({ mode: 'local' });
    await svc.scoreOpportunityWithOutcome(opportunity, context);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mode=remote surfaces a transport failure as an error outcome', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const svc = new AiScoringService({ mode: 'remote', predictUrl: 'https://predict.invalid/score' });
    const result = await svc.scoreOpportunityWithOutcome(opportunity, context);

    expect(result.outcome).toBe('error');
    expect(result.reason).toContain('ECONNREFUSED');
  });

  it('exposes the effective mode', () => {
    expect(new AiScoringService({ mode: 'local' }).mode).toBe('local');
    expect(new AiScoringService({ predictUrl: 'https://x.invalid' }).mode).toBe('remote');
    expect(new AiScoringService({}).mode).toBe('disabled');
  });
});

describe('AI scoring metrics', () => {
  it('counts each outcome in its own bucket', () => {
    const m = new SessionMetrics();
    m.setAiScoringMode('local');
    m.recordAiScore('scored', true);
    m.recordAiScore('scored', false);
    m.recordAiScore('unconfigured');
    m.recordAiScore('disabled');
    m.recordAiScore('error');

    const snap = m.getShadowSnapshot();
    expect(snap.aiScoringMode).toBe('local');
    expect(snap.ai).toEqual({
      requested: 5,
      returned: 2,
      // 'unconfigured' and 'disabled' both mean no scorer was available.
      missing: 2,
      errored: 1,
      actionable: 1,
      belowConfidence: 1,
    });
  });

  it('defaults to an "unknown" mode so an unset run is not read as configured', () => {
    expect(new SessionMetrics().getShadowSnapshot().aiScoringMode).toBe('unknown');
  });
});

describe('readiness treats an unscored run as not ready', () => {
  const base = () => {
    const s = new SessionMetrics().getShadowSnapshot();
    return {
      ...s,
      sessionDurationSec: 30 * 3600,
      quotesRequested: 1_000,
      gateEvaluated: 500,
      gatePassed: 100,
      swapBuildsAttempted: 100,
      swapsBuilt: 100,
      avgNetEdgeUsd: 0.15,
    };
  };

  it('is NOT READY when scoring is disabled', () => {
    const rec = deriveRecommendation({
      ...base(),
      aiScoringMode: 'disabled',
      ai: { requested: 0, returned: 0, missing: 0, errored: 0, actionable: 0, belowConfidence: 0 },
    });
    expect(rec.verdict).toBe('not ready');
    expect(rec.reasons.join(' ')).toContain('AI scoring mode');
  });

  it('is NOT READY when the mode was never recorded', () => {
    const rec = deriveRecommendation(base());
    expect(rec.verdict).toBe('not ready');
  });

  it('is NOT READY when the scorer answered nothing', () => {
    const rec = deriveRecommendation({
      ...base(),
      aiScoringMode: 'remote',
      ai: { requested: 400, returned: 0, missing: 400, errored: 0, actionable: 0, belowConfidence: 0 },
    });
    expect(rec.verdict).toBe('not ready');
    expect(rec.reasons.join(' ')).toContain('0 of 400');
    // The whole point: zeros downstream must not read as a quiet market.
    expect(rec.reasons.join(' ')).toContain('quiet market');
  });

  it('a working scorer does not itself block readiness', () => {
    const rec = deriveRecommendation({
      ...base(),
      aiScoringMode: 'local',
      ai: { requested: 400, returned: 400, missing: 0, errored: 0, actionable: 100, belowConfidence: 300 },
    });
    // Proves the check is not vacuous — it blocks only when scoring is broken.
    expect(rec.verdict).toBe('ready for $1 canary');
  });
});

describe('shadow report AI section', () => {
  const snap = (overrides = {}) => ({
    ...new SessionMetrics().getShadowSnapshot(),
    aiScoringMode: 'local',
    ai: { requested: 500, returned: 500, missing: 0, errored: 0, actionable: 120, belowConfidence: 380 },
    ...overrides,
  });

  it('renders mode and every counter', () => {
    const report = renderShadowReport(snap());
    expect(report).toContain('AI scoring:');
    expect(report).toContain('mode');
    expect(report).toContain('local');
    expect(report).toContain('requested');
    expect(report).toContain('actionable');
    expect(report).toContain('below confidence');
  });

  it('states that the scorer verdict does not gate execution', () => {
    // Without this the counters imply the model drove the decision; it does not.
    const report = renderShadowReport(snap());
    expect(report).toContain('observational');
    expect(report).toContain('net edge');
  });

  it('calls out a scorer that never answered', () => {
    const report = renderShadowReport(
      snap({ ai: { requested: 300, returned: 0, missing: 300, errored: 0, actionable: 0, belowConfidence: 0 } }),
    );
    expect(report).toContain('scorer never answered');
    expect(report).toContain('NOT READY');
  });
});
