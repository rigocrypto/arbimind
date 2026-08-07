/**
 * Shadow-mode safety tests.
 *
 * These assert the guarantees that make a 24–72h shadow run safe to leave
 * unattended. The central one is that with SOLANA_LOG_ONLY=true the executor
 * builds a swap transaction and then stops — it must never reach
 * connection.sendTransaction.
 *
 * No secret material is embedded here: the signer is generated at runtime, so
 * there is no key-shaped literal in the repository.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Solana web3 stub ───────────────────────────────────────────────
// Connection and VersionedTransaction are replaced; Keypair/PublicKey stay
// real so signer loading exercises the production code path.

// vi.mock is hoisted above ordinary declarations, so anything the factory
// touches must come from vi.hoisted or be defined inside the factory itself.
const { sendTransaction, confirmTransaction, getLatestBlockhash, signedTransaction } = vi.hoisted(
  () => ({
    sendTransaction: vi.fn(),
    confirmTransaction: vi.fn(),
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 1_000,
    }),
    signedTransaction: {
      sign: vi.fn(),
      serialize: vi.fn(() => new Uint8Array([1, 2, 3])),
      message: {
        header: {
          numRequiredSignatures: 1,
          numReadonlySignedAccounts: 0,
          numReadonlyUnsignedAccounts: 1,
        },
        staticAccountKeys: [],
        compiledInstructions: [],
      },
    },
  }),
);

/**
 * Silence the winston logger for this file.
 *
 * The readiness-reachability test below drives the executor through 200+ gate
 * evaluations, each emitting several structured log lines. Left unsilenced that
 * floods vitest's console-log RPC (observed: `EnvironmentTeardownError: Closing
 * rpc while "onUserConsoleLog" was pending`) and loads the run enough to trip
 * unrelated env-sensitive tests in other files. A test must not destabilise the
 * suite it runs in.
 */
vi.mock('../../src/utils/Logger', () => ({
  Logger: class {
    info(): void {}
    warn(): void {}
    error(): void {}
    debug(): void {}
  },
}));

vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual<typeof import('@solana/web3.js')>('@solana/web3.js');
  // Declared inside the factory: the executor calls `new Connection(...)`, so
  // this must be constructible — an arrow function is not.
  class MockConnection {
    sendTransaction = sendTransaction;
    confirmTransaction = confirmTransaction;
    getLatestBlockhash = getLatestBlockhash;
    getBalance = vi.fn().mockResolvedValue(1_000_000_000);
    getTokenAccountsByOwner = vi.fn().mockResolvedValue({ value: [] });
    getRecentPrioritizationFees = vi.fn().mockResolvedValue([]);
    getParsedTokenAccountsByOwner = vi.fn().mockResolvedValue({ value: [] });
  }
  return {
    ...actual,
    Connection: MockConnection,
    VersionedTransaction: {
      deserialize: vi.fn(() => signedTransaction),
    },
  };
});

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { SolanaExecutor, classifyQuoteError } from '../../src/solana/Executor';
import type { SolanaExecutorConfig, SwapOpportunity } from '../../src/solana/Executor';
import { SessionMetrics } from '../../src/solana/SessionMetrics';
import { deriveRecommendation, READINESS } from '../../src/solana/ShadowReport';

// ── Fixtures ───────────────────────────────────────────────────────

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Generated per run — never a literal secret in the repo. */
function generateSignerBase58(): string {
  return bs58.encode(Keypair.generate().secretKey);
}

function makeConfig(overrides: Partial<SolanaExecutorConfig> = {}): SolanaExecutorConfig {
  return {
    tradingEnabled: true,
    logOnly: true,
    canaryMode: true,
    onlyDirectRoutes: true,
    allowMultihop: false,
    computeUnitLimit: 200_000,
    priorityFeeMicroLamports: 1_000,
    maxPriceImpactPct: 5,
    ammDenylist: [],
    ammAllowlist: [],
    templateDenylist: [],
    raydiumFingerprintDenylist: [],
    asLegacyTransaction: false,
    tradeSizeMode: 'fixed',
    minSpreadBps: 10,
    allocationPct: 0.5,
    minTradeSizeUsd: 1,
    maxTradeSizeUsd: 5,
    drawdownTriggerPct: 0,
    drawdownScale: 1,
    maxNotionalUsd: 5,
    minNotionalUsd: 0,
    minExpectedProfitUsd: 0.1,
    maxDailyLossUsd: 5,
    stopLossPct: 0,
    takeProfitPct: 0,
    maxSlippageBps: 50,
    quoteMaxAgeMs: 10_000,
    rpcUrl: 'http://localhost:8899',
    privateKeyBase58: generateSignerBase58(),
    jupiterBaseUrl: 'https://jupiter.invalid',
    riskPolicy: {
      denyTiers: ['critical'],
      canaryTiers: [],
      canaryMaxNotionalUsd: 5,
      minEdgeBumpBps: 0,
      incidentCooldownDays: 0,
      denyIncidentTypes: [],
    },
    ...overrides,
  };
}

/** Gate config that passes freely, so gate behaviour is isolated per-test. */
const PERMISSIVE_GATE = {
  minNetProfitUsd: 0,
  riskBufferUsd: 0,
  slippageFallbackUsd: 0,
  slippageDiscountFactor: 0,
  executionHaircutUsd: 0,
  minEdgeBps: 0,
};

function makeOpportunity(overrides: Partial<SwapOpportunity> = {}): SwapOpportunity {
  return {
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amountLamports: 10_000_000,
    estimatedNotionalUsd: 3,
    expectedProfitUsd: 1,
    spreadBps: 100,
    label: 'SOL/USDC',
    ...overrides,
  };
}

/** Jupiter quote + swap responses, routed by URL. */
function installFetchMock(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/quote')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          outAmount: '3050000',
          otherAmountThreshold: '3040000',
          priceImpactPct: '0.01',
          inputMint: SOL_MINT,
          outputMint: USDC_MINT,
          inAmount: '10000000',
          routePlan: [
            { percent: 100, swapInfo: { ammKey: 'pool1', label: 'Whirlpool', inputMint: SOL_MINT, outputMint: USDC_MINT } },
          ],
        }),
      };
    }
    if (url.includes('/swap')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ swapTransaction: Buffer.from('fake-tx').toString('base64') }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// ── Tests ──────────────────────────────────────────────────────────

describe('shadow mode safety', () => {
  beforeEach(() => {
    sendTransaction.mockReset();
    confirmTransaction.mockReset();
    signedTransaction.sign.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe('SOLANA_LOG_ONLY=true', () => {
    it('builds a swap transaction but never calls sendTransaction', async () => {
      installFetchMock();
      const executor = new SolanaExecutor(makeConfig({ logOnly: true }), undefined, {
        gateConfig: PERMISSIVE_GATE,
      });

      const result = await executor.execute(makeOpportunity());

      // Reached the log-only return path: success, flagged log-only, no signature.
      expect(result.success).toBe(true);
      expect(result.logOnly).toBe(true);
      expect(result.signature).toBeUndefined();

      // The guarantee this whole mode rests on.
      expect(sendTransaction).not.toHaveBeenCalled();
      expect(confirmTransaction).not.toHaveBeenCalled();
      // Never even signed — log-only returns before signAndSend.
      expect(signedTransaction.sign).not.toHaveBeenCalled();
    });

    it('records the swap build in shadow metrics without recording a submission', async () => {
      installFetchMock();
      const metrics = new SessionMetrics();
      const executor = new SolanaExecutor(makeConfig({ logOnly: true }), undefined, {
        gateConfig: PERMISSIVE_GATE,
        sessionMetrics: metrics,
      });

      await executor.execute(makeOpportunity());

      const snap = metrics.getShadowSnapshot();
      expect(snap.quotesRequested).toBe(1);
      expect(snap.swapBuildsAttempted).toBe(1);
      expect(snap.swapsBuilt).toBe(1);
      expect(snap.gatePassed).toBe(1);
      // Submitted must stay zero — the report keys its "NOT LOG-ONLY" warning off it.
      expect(snap.submitted).toBe(0);
      expect(sendTransaction).not.toHaveBeenCalled();
    });

    /**
     * Proves the log-only assertions above are not vacuous.
     *
     * A "never sends" test passes trivially if the fixture cannot reach the
     * send path at all. This runs the identical setup with logOnly:false and
     * requires sendTransaction to BE called — so the two tests together show
     * the flag is what stops the send, not a broken harness.
     */
    it('the same fixture DOES reach sendTransaction when logOnly is false', async () => {
      installFetchMock();
      sendTransaction.mockResolvedValue('mock-signature');
      confirmTransaction.mockResolvedValue({ value: { err: null } });

      const executor = new SolanaExecutor(makeConfig({ logOnly: false }), undefined, {
        gateConfig: PERMISSIVE_GATE,
      });

      await executor.execute(makeOpportunity());

      expect(sendTransaction).toHaveBeenCalled();
    });
  });

  describe('pre-execution gates', () => {
    it('SOLANA_TRADING_ENABLED=false skips before any quote, build or send', async () => {
      const fetchMock = installFetchMock();
      const executor = new SolanaExecutor(makeConfig({ tradingEnabled: false }));

      const result = await executor.execute(makeOpportunity());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('SOLANA_TRADING_ENABLED');
      // No network call at all — not even a quote.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(sendTransaction).not.toHaveBeenCalled();
    });

    it('missing wallet key skips before live execution', async () => {
      const fetchMock = installFetchMock();
      const executor = new SolanaExecutor(
        makeConfig({ privateKeyBase58: '', logOnly: false, tradingEnabled: true }),
      );

      const result = await executor.execute(makeOpportunity());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('SOLANA_PRIVATE_KEY_BASE58');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(sendTransaction).not.toHaveBeenCalled();
    });

    it('notional cap rejects oversized opportunities before quoting', async () => {
      const fetchMock = installFetchMock();
      const executor = new SolanaExecutor(makeConfig({ maxNotionalUsd: 5 }));

      const result = await executor.execute(
        makeOpportunity({ estimatedNotionalUsd: 500 }),
      );

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('exceeds max');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(sendTransaction).not.toHaveBeenCalled();
    });

    it('canary mode caps notional below the configured maximum', async () => {
      const fetchMock = installFetchMock();
      // maxNotionalUsd 50 but canaryMode forces the $5 ceiling.
      const executor = new SolanaExecutor(
        makeConfig({ maxNotionalUsd: 50, canaryMode: true }),
      );

      const result = await executor.execute(
        makeOpportunity({ estimatedNotionalUsd: 20 }),
      );

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('exceeds max $5.00');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects opportunities below the minimum expected profit', async () => {
      const fetchMock = installFetchMock();
      const executor = new SolanaExecutor(makeConfig({ minExpectedProfitUsd: 0.1 }));

      const result = await executor.execute(
        makeOpportunity({ expectedProfitUsd: 0.01 }),
      );

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('below minimum');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('stale quote guard', () => {
    it('rejects a quote older than quoteMaxAgeMs instead of sending it', async () => {
      // Delay the swap build so measurable time passes between quoting and
      // sending; with quoteMaxAgeMs=1 the age check is then deterministic
      // rather than racing a sub-millisecond execution.
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: unknown) => {
          const url = String(input);
          if (url.includes('/quote')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                outAmount: '3050000',
                otherAmountThreshold: '3040000',
                priceImpactPct: '0.01',
                inputMint: SOL_MINT,
                outputMint: USDC_MINT,
                routePlan: [
                  { percent: 100, swapInfo: { ammKey: 'pool1', label: 'Whirlpool', inputMint: SOL_MINT, outputMint: USDC_MINT } },
                ],
              }),
            };
          }
          if (url.includes('/swap')) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            return {
              ok: true,
              status: 200,
              json: async () => ({ swapTransaction: Buffer.from('fake-tx').toString('base64') }),
            };
          }
          return { ok: false, status: 404, json: async () => ({}) };
        }),
      );

      // logOnly:false so the stale check in signAndSend is actually reached.
      const executor = new SolanaExecutor(
        makeConfig({ logOnly: false, quoteMaxAgeMs: 1 }),
        undefined,
        { gateConfig: PERMISSIVE_GATE },
      );

      const result = await executor.execute(makeOpportunity());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('quote stale');
      expect(sendTransaction).not.toHaveBeenCalled();
    });
  });

  describe('execution gate economics', () => {
    it('rejects when net expected edge is insufficient', async () => {
      installFetchMock();
      const metrics = new SessionMetrics();
      // Require more net profit than the opportunity can possibly deliver.
      const executor = new SolanaExecutor(makeConfig(), undefined, {
        gateConfig: { ...PERMISSIVE_GATE, minNetProfitUsd: 100 },
        sessionMetrics: metrics,
      });

      const result = await executor.execute(makeOpportunity());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('execution gate');
      expect(sendTransaction).not.toHaveBeenCalled();

      const snap = metrics.getShadowSnapshot();
      expect(snap.gateEvaluated).toBe(1);
      expect(snap.gateRejected).toBe(1);
      expect(snap.gatePassed).toBe(0);
      // No build should be attempted once the gate rejects.
      expect(snap.swapBuildsAttempted).toBe(0);
    });

    it('rejects when net edge in bps is below the floor', async () => {
      installFetchMock();
      const executor = new SolanaExecutor(makeConfig(), undefined, {
        gateConfig: { ...PERMISSIVE_GATE, minEdgeBps: 100_000 },
      });

      const result = await executor.execute(makeOpportunity());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toContain('execution gate');
      expect(sendTransaction).not.toHaveBeenCalled();
    });
  });

  describe('route and venue filters', () => {
    it('rejects multihop routes when only direct routes are allowed', async () => {
      const fetchMock = vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes('/quote')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              outAmount: '3050000',
              priceImpactPct: '0.01',
              routePlan: [
                { percent: 50, swapInfo: { ammKey: 'a', label: 'Whirlpool' } },
                { percent: 50, swapInfo: { ammKey: 'b', label: 'Raydium CLMM' } },
              ],
            }),
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });
      vi.stubGlobal('fetch', fetchMock);

      const metrics = new SessionMetrics();
      const executor = new SolanaExecutor(
        makeConfig({ onlyDirectRoutes: true, allowMultihop: false }),
        undefined,
        { gateConfig: PERMISSIVE_GATE, sessionMetrics: metrics },
      );

      const result = await executor.execute(makeOpportunity());

      expect(result.skipped).toBe(true);
      expect(sendTransaction).not.toHaveBeenCalled();

      // The multihop route is still observed for reporting even though rejected.
      const snap = metrics.getShadowSnapshot();
      expect(snap.routeTypes['multihop_2']).toBe(1);
      expect(snap.skipped).toBeGreaterThan(0);
    });
  });

  describe('log-only economics recording (#411)', () => {
    it('populates expected economics and quote age, leaving realized economics empty', async () => {
      installFetchMock();
      const metrics = new SessionMetrics();
      const executor = new SolanaExecutor(makeConfig({ logOnly: true }), undefined, {
        gateConfig: PERMISSIVE_GATE,
        sessionMetrics: metrics,
      });

      await executor.execute(makeOpportunity());

      const snap = metrics.getShadowSnapshot();
      // Unreachable before #411: only ever recorded on the sign-and-send path,
      // which a log-only run never reaches.
      expect(snap.avgExpectedGrossUsd).not.toBeNull();
      expect(snap.avgExecutionFeeUsd).not.toBeNull();
      expect(snap.avgNetEdgeUsd).not.toBeNull();
      expect(snap.avgNetEdgeBpsOfNotional).not.toBeNull();
      expect(snap.avgQuoteAgeMs).not.toBeNull();

      // A log-only run has no realized PnL, and that must stay explicit rather
      // than being silently backfilled from the expected numbers above.
      expect(snap.realizedTradeCount).toBe(0);
      expect(snap.avgRealizedGrossUsd).toBeNull();
      expect(snap.avgRealizedNetEdgeUsd).toBeNull();
      expect(snap.submitted).toBe(0);
    });

    /**
     * Proves the previously-dead "ready for $1 canary" branch is reachable from
     * a real log-only run, not merely from a hand-built snapshot.
     *
     * Window length is the one readiness dimension a fast test cannot satisfy
     * for real (it needs wall-clock hours), so it is the only field overridden
     * on the snapshot the executor actually produced.
     *
     * The iteration count derives from READINESS.minGateEvaluations rather than
     * a literal, so if #413 replaces that threshold this test tracks the change
     * instead of silently asserting a stale number.
     */
    it('lets a log-only run reach "ready for $1 canary" once enough evaluations accumulate', async () => {
      installFetchMock();
      const metrics = new SessionMetrics();
      metrics.setAiScoringMode('local');
      const executor = new SolanaExecutor(makeConfig({ logOnly: true }), undefined, {
        gateConfig: PERMISSIVE_GATE,
        sessionMetrics: metrics,
      });

      for (let i = 0; i < READINESS.minGateEvaluations + 5; i++) {
        await executor.execute(makeOpportunity());
      }

      const snap = metrics.getShadowSnapshot();
      expect(snap.gateEvaluated).toBeGreaterThanOrEqual(READINESS.minGateEvaluations);
      expect(snap.avgNetEdgeUsd).not.toBeNull();
      expect(snap.avgNetEdgeUsd!).toBeGreaterThan(0);
      expect(snap.submitted).toBe(0);

      const recommendation = deriveRecommendation({ ...snap, sessionDurationSec: 30 * 3600 });
      expect(recommendation.verdict).toBe('ready for $1 canary');
    });
  });

  describe('quote failure classification', () => {
    it('separates rate limiting from other RPC failures', () => {
      expect(classifyQuoteError('Jupiter quote HTTP 429')).toBe('rate_limited');
      expect(classifyQuoteError('Too Many Requests')).toBe('rate_limited');
      expect(classifyQuoteError('request timed out')).toBe('latency');
      expect(classifyQuoteError('ETIMEDOUT')).toBe('latency');
      expect(classifyQuoteError('Jupiter quote HTTP 500')).toBe('error');
    });

    it('records a failed quote without attempting a build or send', async () => {
      const fetchMock = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
      vi.stubGlobal('fetch', fetchMock);

      const metrics = new SessionMetrics();
      const executor = new SolanaExecutor(makeConfig(), undefined, {
        gateConfig: PERMISSIVE_GATE,
        sessionMetrics: metrics,
      });

      const result = await executor.execute(makeOpportunity());

      expect(result.success).toBe(false);
      const snap = metrics.getShadowSnapshot();
      expect(snap.quotesRequested).toBe(1);
      expect(snap.quoteFailures).toBe(1);
      expect(snap.rpc.rateLimited).toBe(1);
      expect(snap.swapBuildsAttempted).toBe(0);
      expect(sendTransaction).not.toHaveBeenCalled();
    });
  });
});
