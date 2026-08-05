/**
 * ShadowReport — log-only performance reporting for Solana shadow runs.
 *
 * Renders a {@link ShadowSnapshot} into a human-readable report and derives a
 * conservative readiness recommendation.
 *
 * This module is pure formatting plus snapshot persistence. It never touches
 * the network, never reads wallet material, and never sends a transaction.
 * Nothing here can enable trading.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { SessionMetrics, ShadowSnapshot } from './SessionMetrics';

// ── Readiness thresholds ───────────────────────────────────────────

/**
 * Minimum evidence required before the report will even consider suggesting a
 * live canary. These are deliberately conservative: the cost of a premature
 * "ready" is real money on a live route, while the cost of an extra day of
 * shadow running is a day.
 */
export const READINESS = {
  /** A run shorter than this cannot characterise a full daily cycle. */
  minWindowHours: 24,
  /** Below this many gate evaluations the pass rate is not a rate, it is noise. */
  minGateEvaluations: 200,
  /** Need to have actually seen the gate let something through. */
  minGatePassed: 10,
  /** Swap building must be reliable before it is trusted to sign. */
  minSwapBuildSuccessRate: 0.95,
  /** Quote failures above this fraction mean the data feed is unreliable. */
  maxQuoteFailureRate: 0.05,
  /** Net expected profit must be positive by a margin, not marginally. */
  minAvgNetEdgeUsd: 0.02,
} as const;

export type ShadowVerdict =
  | 'continue shadow'
  | 'tune thresholds'
  | 'ready for $1 canary'
  | 'not ready';

export interface ShadowRecommendation {
  verdict: ShadowVerdict;
  /** Human-readable justifications, most important first. */
  reasons: string[];
}

// ── Derived rates ──────────────────────────────────────────────────

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function pct(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function usd(value: number | null): string {
  return value === null ? 'n/a' : `$${value.toFixed(4)}`;
}

function ms(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(0)}ms`;
}

/** Sort a count map descending and take the top N as `label=count` strings. */
function topN(counts: Record<string, number>, n: number): string[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => `${label}=${count}`);
}

// ── Recommendation ─────────────────────────────────────────────────

/**
 * Derive a readiness verdict from a snapshot.
 *
 * Fails closed. Any missing evidence produces "continue shadow" or
 * "not ready" — never "ready for $1 canary". A recommendation is only as
 * good as the sample behind it, so an under-powered run is explicitly not
 * treated as a passing run.
 */
export function deriveRecommendation(snapshot: ShadowSnapshot): ShadowRecommendation {
  const reasons: string[] = [];
  const windowHours = snapshot.sessionDurationSec / 3600;

  const quoteFailureRate = rate(snapshot.quoteFailures, snapshot.quotesRequested);
  const swapBuildSuccessRate = rate(snapshot.swapsBuilt, snapshot.swapBuildsAttempted);
  const gatePassRate = rate(snapshot.gatePassed, snapshot.gateEvaluated);

  // --- Hard blockers: something is wrong with the pipeline itself. ---
  const blockers: string[] = [];

  // Contamination check first. A shadow run that submitted anything was not a
  // shadow run, so none of its numbers describe log-only behaviour and no
  // readiness conclusion may be drawn from it. Flagging this in the report body
  // is not enough -- an advisory marker beside a "READY" verdict is exactly the
  // kind of signal that gets read as success.
  if (snapshot.submitted > 0) {
    return {
      verdict: 'not ready',
      reasons: [
        `shadow run was contaminated by ${snapshot.submitted} live submission(s) — SOLANA_LOG_ONLY was not true`,
        'discard this run: its metrics do not describe log-only behaviour',
        'no canary readiness conclusion can be drawn from a contaminated run',
      ],
    };
  }

  // AI scoring blockers. Every opportunity is gated on a score existing, so an
  // unscored run produces zeros through the whole executor funnel. Reporting
  // "no opportunities" for that is the exact failure this check prevents.
  const ai = snapshot.ai;
  if (ai) {
    if (snapshot.aiScoringMode === 'disabled' || snapshot.aiScoringMode === 'unknown') {
      blockers.push(
        `AI scoring mode is "${snapshot.aiScoringMode}" — no opportunity can reach the executor. ` +
          'Set AI_SCORING_MODE=local (or configure AI_PREDICT_URL) before drawing conclusions.',
      );
    }
    if (ai.requested > 0 && ai.returned === 0) {
      const detail = ai.missing > 0 ? `${ai.missing} missing` : `${ai.errored} errored`;
      blockers.push(
        `AI scorer answered 0 of ${ai.requested} requests (${detail}) — the funnel never started, ` +
          'so zero opportunities does not mean a quiet market',
      );
    }
  }

  if (snapshot.quotesRequested === 0) {
    blockers.push('no quotes were requested — scanner or executor never reached the quote stage');
  }
  if (quoteFailureRate !== null && quoteFailureRate > READINESS.maxQuoteFailureRate) {
    blockers.push(
      `quote failure rate ${pct(quoteFailureRate)} exceeds ${pct(READINESS.maxQuoteFailureRate)} — data feed unreliable`,
    );
  }
  if (
    swapBuildSuccessRate !== null &&
    snapshot.swapBuildsAttempted > 0 &&
    swapBuildSuccessRate < READINESS.minSwapBuildSuccessRate
  ) {
    blockers.push(
      `swap build success rate ${pct(swapBuildSuccessRate)} below ${pct(READINESS.minSwapBuildSuccessRate)}`,
    );
  }
  if (snapshot.rpc.rateLimited > 0 && snapshot.quotesRequested > 0) {
    const rlRate = snapshot.rpc.rateLimited / snapshot.quotesRequested;
    if (rlRate > 0.02) {
      blockers.push(
        `RPC rate limiting on ${pct(rlRate)} of quotes — reduce scan rate before adding live execution`,
      );
    }
  }

  if (blockers.length > 0) {
    return { verdict: 'not ready', reasons: blockers };
  }

  // --- Insufficient evidence: the run is fine, just not conclusive yet. ---
  if (windowHours < READINESS.minWindowHours) {
    reasons.push(
      `window ${windowHours.toFixed(1)}h is under the ${READINESS.minWindowHours}h minimum`,
    );
  }
  if (snapshot.gateEvaluated < READINESS.minGateEvaluations) {
    reasons.push(
      `only ${snapshot.gateEvaluated} gate evaluations (need ${READINESS.minGateEvaluations}) — pass rate is not yet statistically meaningful`,
    );
  }
  if (reasons.length > 0) {
    return { verdict: 'continue shadow', reasons };
  }

  // --- Enough evidence: is the economics actually favourable? ---
  if (snapshot.gatePassed < READINESS.minGatePassed) {
    return {
      verdict: 'tune thresholds',
      reasons: [
        `gate passed only ${snapshot.gatePassed} times in ${snapshot.gateEvaluated} evaluations (${pct(gatePassRate)})`,
        `top reject reasons: ${topN(snapshot.rejectReasons, 3).join(', ') || 'none recorded'}`,
        'thresholds are rejecting effectively everything — either the market lacks edge or the gate is too strict',
      ],
    };
  }
  if (snapshot.avgNetEdgeUsd === null || snapshot.avgNetEdgeUsd < READINESS.minAvgNetEdgeUsd) {
    return {
      verdict: 'tune thresholds',
      reasons: [
        `average net expected profit ${usd(snapshot.avgNetEdgeUsd)} is below the ${usd(READINESS.minAvgNetEdgeUsd)} margin`,
        'passing trades are too marginal to survive real execution drag',
      ],
    };
  }

  return {
    verdict: 'ready for $1 canary',
    reasons: [
      `${windowHours.toFixed(1)}h window with ${snapshot.gateEvaluated} gate evaluations`,
      `gate pass rate ${pct(gatePassRate)} (${snapshot.gatePassed} passed)`,
      `swap build success ${pct(swapBuildSuccessRate)}`,
      `average net expected profit ${usd(snapshot.avgNetEdgeUsd)}`,
      'shadow evidence supports a manually-reviewed $1 canary — this is a recommendation, not an authorisation',
    ],
  };
}

// ── Report rendering ───────────────────────────────────────────────

/**
 * Render a snapshot as the shadow performance report.
 *
 * Output contains only aggregates and venue labels. No signatures, wallet
 * addresses, RPC URLs or API keys pass through here.
 */
export function renderShadowReport(snapshot: ShadowSnapshot): string {
  const windowHours = snapshot.sessionDurationSec / 3600;
  const quoteFailureRate = rate(snapshot.quoteFailures, snapshot.quotesRequested);
  const swapBuildSuccessRate = rate(snapshot.swapsBuilt, snapshot.swapBuildsAttempted);
  const gatePassRate = rate(snapshot.gatePassed, snapshot.gateEvaluated);
  const recommendation = deriveRecommendation(snapshot);

  const lines: string[] = [];
  const push = (label: string, value: string): void => {
    lines.push(`  ${label.padEnd(26)}${value}`);
  };

  lines.push('SHADOW PERFORMANCE REPORT');
  lines.push('='.repeat(60));
  lines.push('');

  lines.push('window:');
  push('start', snapshot.startedAtIso);
  push('captured', snapshot.capturedAtIso);
  push('duration', `${windowHours.toFixed(2)}h`);
  lines.push('');

  lines.push('AI scoring:');
  push('mode', snapshot.aiScoringMode ?? 'unknown');
  if (snapshot.ai) {
    push('requested', String(snapshot.ai.requested));
    push('returned', String(snapshot.ai.returned));
    push('actionable', String(snapshot.ai.actionable));
    push('missing', String(snapshot.ai.missing));
    push('below confidence', String(snapshot.ai.belowConfidence));
    push('errored', String(snapshot.ai.errored));
    if (snapshot.ai.requested > 0 && snapshot.ai.returned === 0) {
      lines.push('  ^ scorer never answered — the executor funnel below never started');
    }
  }
  // Stated plainly because the numbers invite the opposite reading: the
  // scanner's execute decision comes from net edge, not from this score.
  lines.push('  note: scorer verdict is observational — execution is gated on net edge,');
  lines.push('        and a score is currently required only to be present, not favourable');
  lines.push('');

  lines.push('opportunities:');
  push('detected', String(snapshot.discovered));
  push('skipped (pre-gate)', String(snapshot.skipped));
  lines.push('');

  lines.push('quotes:');
  push('requested', String(snapshot.quotesRequested));
  push('failed', `${snapshot.quoteFailures} (${pct(quoteFailureRate)})`);
  push('avg age', ms(snapshot.avgQuoteAgeMs));
  lines.push('');

  lines.push('swap builds:');
  push('attempted', String(snapshot.swapBuildsAttempted));
  push('succeeded', String(snapshot.swapsBuilt));
  push('failed', String(snapshot.swapBuildFailed));
  push('success rate', pct(swapBuildSuccessRate));
  lines.push('');

  lines.push('gate pass rate:');
  push('evaluated', String(snapshot.gateEvaluated));
  push('passed', String(snapshot.gatePassed));
  push('rejected', String(snapshot.gateRejected));
  push('pass rate', pct(gatePassRate));
  lines.push('');

  lines.push('top reject reasons:');
  const rejects = topN(snapshot.rejectReasons, 5);
  if (rejects.length === 0) lines.push('  (none recorded)');
  else rejects.forEach((r) => lines.push(`  ${r}`));
  lines.push('');

  lines.push('top pre-gate skips:');
  const skips = topN(snapshot.skipReasons, 5);
  if (skips.length === 0) lines.push('  (none recorded)');
  else skips.forEach((r) => lines.push(`  ${r}`));
  lines.push('');

  lines.push('top AMMs:');
  const amms = topN(snapshot.ammLabels, 5);
  if (amms.length === 0) lines.push('  (none recorded)');
  else amms.forEach((r) => lines.push(`  ${r}`));
  lines.push('');

  lines.push('route types:');
  const routes = topN(snapshot.routeTypes, 5);
  if (routes.length === 0) lines.push('  (none recorded)');
  else routes.forEach((r) => lines.push(`  ${r}`));
  lines.push('');

  lines.push('latency:');
  push('quote avg', ms(snapshot.quoteLatency.avgMs));
  push('quote max', ms(snapshot.quoteLatency.maxMs));
  push('swap build avg', ms(snapshot.swapBuildLatency.avgMs));
  push('swap build max', ms(snapshot.swapBuildLatency.maxMs));
  lines.push('');

  lines.push('expected economics:');
  push('avg gross profit', usd(snapshot.avgExpectedGrossUsd));
  push('avg execution fee', usd(snapshot.avgExecutionFeeUsd));
  push('avg slippage cost', usd(snapshot.avgSlippageCostUsd));
  push('avg net profit', usd(snapshot.avgNetEdgeUsd));
  push('avg edge bps', snapshot.avgNetEdgeBpsOfNotional === null ? 'n/a' : `${snapshot.avgNetEdgeBpsOfNotional}`);
  push('best gross seen', usd(snapshot.bestGrossOverallUsd));
  lines.push('');

  lines.push('risk notes:');
  push('rpc errors', String(snapshot.rpc.errors));
  push('rpc rate-limited (429)', String(snapshot.rpc.rateLimited));
  push('rpc latency failures', String(snapshot.rpc.latencyFailures));
  // Submitted must be zero for a log-only run. Surfacing it makes a
  // misconfigured run obvious in the report itself rather than only in logs.
  push('transactions submitted', `${snapshot.submitted}${snapshot.submitted > 0 ? '  <-- NOT LOG-ONLY' : ''}`);
  lines.push('');

  lines.push('recommendation:');
  lines.push(`  ${recommendation.verdict.toUpperCase()}`);
  recommendation.reasons.forEach((r) => lines.push(`    - ${r}`));
  lines.push('');

  return lines.join('\n');
}

// ── Snapshot persistence ───────────────────────────────────────────

/**
 * Periodically writes a shadow snapshot to disk so a 24–72h run can be
 * reported on while still in progress, or after the process has exited.
 *
 * Opt-in: nothing starts unless an explicit path is supplied. Writes are
 * atomic (temp file + rename) so the report script can never observe a
 * half-written JSON document.
 */
export class ShadowSnapshotWriter {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly metrics: SessionMetrics,
    private readonly filePath: string,
    private readonly intervalMs: number = 60_000,
  ) {}

  async writeOnce(): Promise<void> {
    const snapshot = this.metrics.getShadowSnapshot();
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      // A failed snapshot write must never interrupt the trading loop: the
      // report is observability, not a dependency of execution.
      void this.writeOnce().catch(() => undefined);
    }, this.intervalMs);
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/** Read a snapshot written by {@link ShadowSnapshotWriter}. */
export async function readShadowSnapshot(filePath: string): Promise<ShadowSnapshot> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as ShadowSnapshot;
  if (parsed.schemaVersion !== 1) {
    throw new Error(
      `unsupported shadow snapshot schemaVersion ${String(parsed.schemaVersion)} (expected 1)`,
    );
  }
  return parsed;
}
