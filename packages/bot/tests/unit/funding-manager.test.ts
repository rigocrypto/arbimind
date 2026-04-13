import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FundingManager, type FundingManagerConfig, type WalletSnapshot } from '../../src/solana/FundingManager';
import { Connection, PublicKey } from '@solana/web3.js';

// ── Test config ──────────────────────────────────────────────────
const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

function makeConfig(overrides?: Partial<FundingManagerConfig>): FundingManagerConfig {
  return {
    targetSolReserve: 0.25,
    minSolReserve: 0.15,
    baseAssetMint: MINT_USDC,
    baseAsset: 'USDC',
    minRebalanceUsd: 5,
    maxRebalanceCostBps: 30,
    rebalanceCooldownMs: 60_000,
    jupiterBaseUrl: 'https://lite-api.jup.ag/swap/v1',
    ...overrides,
  };
}

// ── Mock helpers ─────────────────────────────────────────────────

function mockConnection(opts: {
  solLamports?: number;
  tokenAccounts?: Array<{ mint: string; amount: string; decimals: number }>;
}): Connection {
  const conn = {
    getBalance: vi.fn().mockResolvedValue(opts.solLamports ?? 500_000_000), // 0.5 SOL default
    getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({
      value: (opts.tokenAccounts ?? []).map((ta) => ({
        account: {
          data: {
            parsed: {
              info: {
                mint: ta.mint,
                tokenAmount: { amount: ta.amount, decimals: ta.decimals },
              },
            },
          },
        },
      })),
    }),
  } as unknown as Connection;
  return conn;
}

const TEST_PUBKEY = new PublicKey('11111111111111111111111111111111');

describe('FundingManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch for Jupiter SOL price (return 150 USDC)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ outAmount: '150000000' }), // 150 USDC in 6-decimal raw
    }));
  });

  describe('takeSnapshot', () => {
    it('reads SOL, USDC, and USDT balances', async () => {
      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 300_000_000, // 0.3 SOL
        tokenAccounts: [
          { mint: MINT_USDC, amount: '50000000', decimals: 6 },   // 50 USDC
          { mint: MINT_USDT, amount: '10000000', decimals: 6 },   // 10 USDT
        ],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);

      expect(snap.solBalance).toBeCloseTo(0.3, 4);
      expect(snap.usdcBalance).toBeCloseTo(50, 2);
      expect(snap.usdtBalance).toBeCloseTo(10, 2);
      expect(snap.solPriceUsd).toBeCloseTo(150, 0);
    });

    it('computes solExcessVsTarget when above target', async () => {
      const fm = new FundingManager(makeConfig({ targetSolReserve: 0.25 }));
      const conn = mockConnection({
        solLamports: 500_000_000, // 0.5 SOL
        tokenAccounts: [
          { mint: MINT_USDC, amount: '100000000', decimals: 6 },
        ],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);

      expect(snap.solExcessVsTarget).toBeCloseTo(0.25, 4);
      expect(snap.solDeficitVsMin).toBe(0);
    });

    it('computes solDeficitVsMin when below minimum', async () => {
      const fm = new FundingManager(makeConfig({ minSolReserve: 0.15 }));
      const conn = mockConnection({
        solLamports: 100_000_000, // 0.1 SOL
        tokenAccounts: [
          { mint: MINT_USDC, amount: '100000000', decimals: 6 },
        ],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);

      expect(snap.solDeficitVsMin).toBeCloseTo(0.05, 4);
      expect(snap.solExcessVsTarget).toBe(0);
    });

    it('blocks trading when SOL is below minimum reserve', async () => {
      const fm = new FundingManager(makeConfig({ minSolReserve: 0.15 }));
      const conn = mockConnection({
        solLamports: 100_000_000, // 0.1 SOL
        tokenAccounts: [
          { mint: MINT_USDC, amount: '100000000', decimals: 6 },
        ],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);

      expect(snap.tradingBlocked).toBe(true);
      expect(snap.blockReason).toContain('SOL below min reserve');
    });

    it('blocks trading when base asset is below $1', async () => {
      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 500_000_000, // 0.5 SOL — OK
        tokenAccounts: [
          { mint: MINT_USDC, amount: '500000', decimals: 6 }, // $0.50
        ],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);

      expect(snap.tradingBlocked).toBe(true);
      expect(snap.blockReason).toContain('base asset too low');
    });

    it('does not block trading when reserves and capital are healthy', async () => {
      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 300_000_000, // 0.3 SOL
        tokenAccounts: [
          { mint: MINT_USDC, amount: '50000000', decimals: 6 }, // $50
        ],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);

      expect(snap.tradingBlocked).toBe(false);
      expect(snap.blockReason).toBeNull();
      expect(snap.availableTradeCapitalUsd).toBeCloseTo(50, 2);
    });

    it('handles zero token accounts gracefully', async () => {
      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 300_000_000,
        tokenAccounts: [],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);

      expect(snap.usdcBalance).toBe(0);
      expect(snap.usdtBalance).toBe(0);
      expect(snap.availableTradeCapitalUsd).toBe(0);
      expect(snap.tradingBlocked).toBe(true);
    });

    it('ignores unsupported token mints', async () => {
      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 300_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '50000000', decimals: 6 },
          { mint: '1234567890abcdef1234567890abcdef12345678', amount: '999999999', decimals: 9 },
        ],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);

      expect(snap.usdcBalance).toBeCloseTo(50, 2);
      // unsupported token should not affect anything
      expect(snap.availableTradeCapitalUsd).toBeCloseTo(50, 2);
    });
  });

  describe('checkAndRebalance (step 1 — snapshot only)', () => {
    it('returns triggered=false with reason step1_snapshot_only', async () => {
      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 300_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '50000000', decimals: 6 },
        ],
      });

      const result = await fm.checkAndRebalance(conn, TEST_PUBKEY);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('step1_snapshot_only');
    });

    it('updates lastSnapshot accessible via getWalletSnapshot()', async () => {
      const fm = new FundingManager(makeConfig());
      expect(fm.getWalletSnapshot()).toBeNull();

      const conn = mockConnection({
        solLamports: 300_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '25000000', decimals: 6 },
        ],
      });

      await fm.checkAndRebalance(conn, TEST_PUBKEY);

      const snap = fm.getWalletSnapshot();
      expect(snap).not.toBeNull();
      expect(snap!.solBalance).toBeCloseTo(0.3, 4);
      expect(snap!.usdcBalance).toBeCloseTo(25, 2);
    });
  });

  describe('getAvailableCapitalUsd', () => {
    it('returns 0 before any snapshot', () => {
      const fm = new FundingManager(makeConfig());
      expect(fm.getAvailableCapitalUsd()).toBe(0);
    });

    it('returns base asset balance after snapshot', async () => {
      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 300_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '75000000', decimals: 6 },
        ],
      });

      await fm.takeSnapshot(conn, TEST_PUBKEY);

      expect(fm.getAvailableCapitalUsd()).toBeCloseTo(75, 2);
    });
  });

  describe('isTradingBlocked', () => {
    it('returns true before any snapshot (defensive)', () => {
      const fm = new FundingManager(makeConfig());
      expect(fm.isTradingBlocked()).toBe(true);
    });

    it('reflects the latest snapshot state', async () => {
      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 300_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '50000000', decimals: 6 },
        ],
      });

      await fm.takeSnapshot(conn, TEST_PUBKEY);
      expect(fm.isTradingBlocked()).toBe(false);
    });
  });

  describe('SOL price fetch', () => {
    it('handles Jupiter fetch failure gracefully (solPriceUsd = 0)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 300_000_000,
        tokenAccounts: [{ mint: MINT_USDC, amount: '50000000', decimals: 6 }],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);
      expect(snap.solPriceUsd).toBe(0);
    });

    it('handles fetch exception gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 300_000_000,
        tokenAccounts: [{ mint: MINT_USDC, amount: '50000000', decimals: 6 }],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);
      expect(snap.solPriceUsd).toBe(0);
    });
  });

  describe('USDT as base asset', () => {
    it('uses USDT balance as availableTradeCapitalUsd', async () => {
      const fm = new FundingManager(makeConfig({
        baseAsset: 'USDT',
        baseAssetMint: MINT_USDT,
      }));
      const conn = mockConnection({
        solLamports: 300_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '50000000', decimals: 6 },
          { mint: MINT_USDT, amount: '30000000', decimals: 6 },
        ],
      });

      const snap = await fm.takeSnapshot(conn, TEST_PUBKEY);

      expect(snap.availableTradeCapitalUsd).toBeCloseTo(30, 2);
      expect(snap.usdcBalance).toBeCloseTo(50, 2);
      expect(snap.usdtBalance).toBeCloseTo(30, 2);
    });
  });
});
