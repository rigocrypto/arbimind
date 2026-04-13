import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InventoryConfig } from '../../src/solana/config';

// We test the pure logic methods of SolanaInventoryManager by constructing it
// with a known config and exercising snapshot-based helpers.
// Network-dependent methods (refreshBalances, executeFundingSwap) are excluded,
// as they require a real Connection/RPC and belong in integration tests.

function makeConfig(overrides: Partial<InventoryConfig> = {}): InventoryConfig {
  return {
    autoFundEnabled: true,
    baseAsset: 'USDC',
    baseAssetMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    minSolReserve: 0.15,
    targetSolReserve: 0.25,
    autoFundMinSwapUsd: 0.50,
    fundingRebalanceIntervalMs: 60_000,
    positionSizeFraction: 0.25,
    minTradeUsd: 0.20,
    maxTradeUsd: 250,
    compoundProfits: true,
    ...overrides,
  };
}

// Dynamic import so the module's Logger (which reads env) doesn't break test isolation
async function createManager(configOverrides: Partial<InventoryConfig> = {}) {
  const { SolanaInventoryManager } = await import('../../src/solana/InventoryManager');
  return new SolanaInventoryManager({
    config: makeConfig(configOverrides),
    jupiterBaseUrl: 'https://lite-api.jup.ag/swap/v1',
    maxSlippageBps: 50,
    asLegacyTransaction: true,
    priorityFeeLamports: 100_000,
  });
}

// ─────────────────────────────────────────────────────────────────
// Position sizing
// ─────────────────────────────────────────────────────────────────
describe('computeRecommendedTradeSize', () => {
  it('returns fraction of available capital', async () => {
    const mgr = await createManager({ positionSizeFraction: 0.25 });
    expect(mgr.computeRecommendedTradeSize(100)).toBe(25);
  });

  it('caps at maxTradeUsd', async () => {
    const mgr = await createManager({ positionSizeFraction: 0.5, maxTradeUsd: 10 });
    expect(mgr.computeRecommendedTradeSize(100)).toBe(10);
  });

  it('returns 0 when proposed < minTradeUsd (no-churn)', async () => {
    const mgr = await createManager({ positionSizeFraction: 0.25, minTradeUsd: 5 });
    // 10 * 0.25 = 2.5 < 5 → 0
    expect(mgr.computeRecommendedTradeSize(10)).toBe(0);
  });

  it('returns exactly minTradeUsd when proposed equals it', async () => {
    const mgr = await createManager({ positionSizeFraction: 0.25, minTradeUsd: 2.5 });
    // 10 * 0.25 = 2.5 == minTradeUsd → 2.5 (not zero)
    expect(mgr.computeRecommendedTradeSize(10)).toBe(2.5);
  });

  it('increasing balance increases recommended trade size', async () => {
    const mgr = await createManager({ positionSizeFraction: 0.25, minTradeUsd: 0.20, maxTradeUsd: 250 });
    const small = mgr.computeRecommendedTradeSize(50);
    const large = mgr.computeRecommendedTradeSize(200);
    expect(large).toBeGreaterThan(small);
  });
});

// ─────────────────────────────────────────────────────────────────
// Funding lock
// ─────────────────────────────────────────────────────────────────
describe('funding lock', () => {
  it('acquires lock on first call, rejects on second', async () => {
    const mgr = await createManager();
    expect(mgr.acquireLock()).toBe(true);
    expect(mgr.isLocked()).toBe(true);
    expect(mgr.acquireLock()).toBe(false);
  });

  it('allows re-acquisition after release', async () => {
    const mgr = await createManager();
    mgr.acquireLock();
    mgr.releaseLock();
    expect(mgr.isLocked()).toBe(false);
    expect(mgr.acquireLock()).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// Trading gate
// ─────────────────────────────────────────────────────────────────
describe('checkTradingGate', () => {
  it('blocks when no snapshot is available', async () => {
    const mgr = await createManager();
    const gate = mgr.checkTradingGate();
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('no inventory snapshot');
  });

  it('blocks on SOL reserve deficit', async () => {
    const mgr = await createManager({ minSolReserve: 0.15, minTradeUsd: 0.20 });
    const snapshot = {
      solBalance: 0.05,
      solReserveDeficit: 0.10,
      solReserveExcess: 0,
      baseAssetBalance: 100,
      baseAssetMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      baseAssetSymbol: 'USDC',
      nonBaseStableBalance: 0,
      nonBaseStableMint: null,
      unsupportedTokens: [],
      availableTradingCapitalUsd: 100,
      recommendedTradeSizeUsd: 25,
      tradingBlocked: true,
      blockReason: 'SOL reserve deficit: 0.0500 < min 0.15',
      solPriceUsd: 150,
      timestampMs: Date.now(),
    };
    const gate = mgr.checkTradingGate(snapshot);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('SOL reserve deficit');
  });

  it('blocks when capital < minTradeUsd', async () => {
    const mgr = await createManager({ minTradeUsd: 5 });
    const snapshot = {
      solBalance: 1,
      solReserveDeficit: 0,
      solReserveExcess: 0,
      baseAssetBalance: 2,
      baseAssetMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      baseAssetSymbol: 'USDC',
      nonBaseStableBalance: 0,
      nonBaseStableMint: null,
      unsupportedTokens: [],
      availableTradingCapitalUsd: 2,
      recommendedTradeSizeUsd: 0,
      tradingBlocked: true,
      blockReason: 'insufficient base asset: $2.00 < min $5.00',
      solPriceUsd: 150,
      timestampMs: Date.now(),
    };
    const gate = mgr.checkTradingGate(snapshot);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain('insufficient base asset');
  });

  it('allows when SOL and capital are sufficient', async () => {
    const mgr = await createManager();
    const snapshot = {
      solBalance: 0.30,
      solReserveDeficit: 0,
      solReserveExcess: 0.05,
      baseAssetBalance: 100,
      baseAssetMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      baseAssetSymbol: 'USDC',
      nonBaseStableBalance: 0,
      nonBaseStableMint: null,
      unsupportedTokens: [],
      availableTradingCapitalUsd: 100,
      recommendedTradeSizeUsd: 25,
      tradingBlocked: false,
      blockReason: null,
      solPriceUsd: 150,
      timestampMs: Date.now(),
    };
    const gate = mgr.checkTradingGate(snapshot);
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBeNull();
    expect(gate.recommendedSizeUsd).toBe(25);
  });
});

// ─────────────────────────────────────────────────────────────────
// PnL tracking
// ─────────────────────────────────────────────────────────────────
describe('PnL tracking', () => {
  it('accumulates realized PnL across trades', async () => {
    const mgr = await createManager();
    expect(mgr.getCumulativeRealizedPnlUsd()).toBe(0);

    mgr.recordTradeResult(100, 100.5); // +0.50
    expect(mgr.getCumulativeRealizedPnlUsd()).toBeCloseTo(0.5);

    mgr.recordTradeResult(100.5, 101.2); // +0.70
    expect(mgr.getCumulativeRealizedPnlUsd()).toBeCloseTo(1.2);
  });

  it('tracks negative PnL', async () => {
    const mgr = await createManager();
    mgr.recordTradeResult(100, 99.5); // -0.50
    expect(mgr.getCumulativeRealizedPnlUsd()).toBeCloseTo(-0.5);
  });
});

// ─────────────────────────────────────────────────────────────────
// needsFundingRebalance
// ─────────────────────────────────────────────────────────────────
describe('needsFundingRebalance', () => {
  it('returns false when autoFundEnabled is false', async () => {
    const mgr = await createManager({ autoFundEnabled: false });
    expect(mgr.needsFundingRebalance()).toBe(false);
  });

  it('returns false with no snapshot', async () => {
    const mgr = await createManager();
    expect(mgr.needsFundingRebalance()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────
// Snapshot access defaults
// ─────────────────────────────────────────────────────────────────
describe('snapshot defaults', () => {
  it('returns null snapshot and zero capital before any refresh', async () => {
    const mgr = await createManager();
    expect(mgr.getInventorySnapshot()).toBeNull();
    expect(mgr.getAvailableTradingCapitalUsd()).toBe(0);
    expect(mgr.getRecommendedTradeSizeUsd()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// Rebalance loop lifecycle
// ─────────────────────────────────────────────────────────────────
describe('rebalance loop lifecycle', () => {
  it('stopRebalanceLoop is safe to call when loop never started', async () => {
    const mgr = await createManager();
    // Should not throw
    mgr.stopRebalanceLoop();
  });
});
