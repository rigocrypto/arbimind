import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FundingManager, type FundingManagerConfig, type WalletSnapshot } from '../../src/solana/FundingManager';
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';

// ── Test config ──────────────────────────────────────────────────
const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';

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
  sendTransaction?: ReturnType<typeof vi.fn>;
  confirmTransaction?: ReturnType<typeof vi.fn>;
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
    sendTransaction: opts.sendTransaction ?? vi.fn().mockResolvedValue('mock-sig-abc123'),
    confirmTransaction: opts.confirmTransaction ?? vi.fn().mockResolvedValue({ value: { err: null } }),
  } as unknown as Connection;
  return conn;
}

const TEST_KEYPAIR = Keypair.generate();
const TEST_PUBKEY = TEST_KEYPAIR.publicKey;

/**
 * Build a mock fetch that routes Jupiter calls:
 *  - /quote with amount=1000000000 → SOL price response (always)
 *  - /quote with other amounts    → swap quote response
 *  - /swap (POST)                 → swap transaction
 */
function mockJupiterFetch(opts?: {
  priceOutAmount?: string;
  quoteOutAmount?: string;
  quoteOtherAmountThreshold?: string;
  swapTransaction?: string;
  quoteError?: boolean;
  swapError?: boolean;
}) {
  const {
    priceOutAmount = '150000000',      // 150 USDC (SOL price)
    quoteOutAmount = '7500000',        // 7.50 USDC output
    quoteOtherAmountThreshold = '7475000', // ~0.33% slippage
    swapTransaction = 'AAAA',          // dummy base64
    quoteError = false,
    swapError = false,
  } = opts ?? {};

  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : String(url);

    // POST /swap
    if (init?.method === 'POST' && urlStr.includes('/swap')) {
      if (swapError) {
        return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('swap error') });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ swapTransaction }),
      });
    }

    // GET /quote — distinguish SOL price lookup (amount=1000000000) from swap quotes
    if (urlStr.includes('/quote')) {
      const isSolPriceCall = urlStr.includes('amount=1000000000');
      if (isSolPriceCall) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ outAmount: priceOutAmount }),
        });
      }
      // Swap quote
      if (quoteError) {
        return Promise.resolve({ ok: false, status: 500 });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          outAmount: quoteOutAmount,
          otherAmountThreshold: quoteOtherAmountThreshold,
          priceImpactPct: '0.1',
          routePlan: [],
        }),
      });
    }

    // Fallback — price response
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ outAmount: priceOutAmount }),
    });
  });
}

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

  describe('checkAndRebalance (no-action paths)', () => {
    it('returns triggered=false with reason no_action_needed when balanced', async () => {
      const fm = new FundingManager(makeConfig());
      // SOL at target (0.25), no excess, no USDT → no action
      const conn = mockConnection({
        solLamports: 250_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '50000000', decimals: 6 },
        ],
      });

      const result = await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('no_action_needed');
    });

    it('updates lastSnapshot accessible via getWalletSnapshot()', async () => {
      const fm = new FundingManager(makeConfig());
      expect(fm.getWalletSnapshot()).toBeNull();

      const conn = mockConnection({
        solLamports: 250_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '25000000', decimals: 6 },
        ],
      });

      await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      const snap = fm.getWalletSnapshot();
      expect(snap).not.toBeNull();
      expect(snap!.solBalance).toBeCloseTo(0.25, 4);
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

  // ── Step 2: Swap execution tests ──────────────────────────────

  describe('checkAndRebalance — SOL excess swap', () => {
    it('triggers swap when SOL excess is above minRebalanceUsd', async () => {
      // 0.5 SOL, target 0.25 → excess 0.25 SOL → $37.50 at $150
      vi.stubGlobal('fetch', mockJupiterFetch());
      // Mock VersionedTransaction.deserialize
      vi.spyOn(VersionedTransaction, 'deserialize').mockReturnValue({
        sign: vi.fn(),
      } as unknown as VersionedTransaction);

      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 500_000_000,
        tokenAccounts: [{ mint: MINT_USDC, amount: '50000000', decimals: 6 }],
      });

      const result = await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('sol_excess_swapped');
      expect(result.details?.signature).toBe('mock-sig-abc123');
    });

    it('skips swap when SOL excess is below minRebalanceUsd', async () => {
      // 0.26 SOL, target 0.25 → excess 0.01 SOL → $1.50 at $150, below min $5
      vi.stubGlobal('fetch', mockJupiterFetch());

      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 260_000_000,
        tokenAccounts: [{ mint: MINT_USDC, amount: '50000000', decimals: 6 }],
      });

      const result = await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('below_min_usd');
    });

    it('skips swap when Jupiter quote is too expensive', async () => {
      // High slippage: otherAmountThreshold much lower than outAmount → high cost BPS
      vi.stubGlobal('fetch', mockJupiterFetch({
        quoteOutAmount: '37500000',          // 37.5 USDC
        quoteOtherAmountThreshold: '35000000', // 2.5 USDC slippage → ~667 BPS
      }));

      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 500_000_000,
        tokenAccounts: [{ mint: MINT_USDC, amount: '50000000', decimals: 6 }],
      });

      const result = await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('too_expensive');
      expect((result.details?.costBps as number)).toBeGreaterThan(30);
    });
  });

  describe('checkAndRebalance — USDT normalization', () => {
    it('triggers USDT→USDC swap when USDT >= minRebalanceUsd and no SOL excess', async () => {
      vi.stubGlobal('fetch', mockJupiterFetch({ quoteOutAmount: '10000000', quoteOtherAmountThreshold: '9990000' }));
      vi.spyOn(VersionedTransaction, 'deserialize').mockReturnValue({
        sign: vi.fn(),
      } as unknown as VersionedTransaction);

      // SOL at target (0.25), $10 USDT
      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 250_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '50000000', decimals: 6 },
          { mint: MINT_USDT, amount: '10000000', decimals: 6 },
        ],
      });

      const result = await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('usdt_normalized');
    });

    it('skips USDT normalization when USDT below minRebalanceUsd', async () => {
      vi.stubGlobal('fetch', mockJupiterFetch());

      // SOL at target, only $3 USDT (below $5 min)
      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 250_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '50000000', decimals: 6 },
          { mint: MINT_USDT, amount: '3000000', decimals: 6 },
        ],
      });

      const result = await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      expect(result.triggered).toBe(false);
      expect(result.reason).toBe('no_action_needed');
    });
  });

  describe('checkAndRebalance — cooldown', () => {
    it('skips swap on second call within cooldown window', async () => {
      vi.stubGlobal('fetch', mockJupiterFetch());
      vi.spyOn(VersionedTransaction, 'deserialize').mockReturnValue({
        sign: vi.fn(),
      } as unknown as VersionedTransaction);

      const fm = new FundingManager(makeConfig({ rebalanceCooldownMs: 60_000 }));
      const conn = mockConnection({
        solLamports: 500_000_000,
        tokenAccounts: [{ mint: MINT_USDC, amount: '50000000', decimals: 6 }],
      });

      // First call — triggers swap
      const r1 = await fm.checkAndRebalance(conn, TEST_KEYPAIR);
      expect(r1.triggered).toBe(true);

      // Second call — within cooldown → skip
      const r2 = await fm.checkAndRebalance(conn, TEST_KEYPAIR);
      expect(r2.triggered).toBe(false);
      expect(r2.reason).toBe('cooldown');
    });

    it('allows swap after cooldown elapsed', async () => {
      vi.stubGlobal('fetch', mockJupiterFetch());
      vi.spyOn(VersionedTransaction, 'deserialize').mockReturnValue({
        sign: vi.fn(),
      } as unknown as VersionedTransaction);

      const fm = new FundingManager(makeConfig({ rebalanceCooldownMs: 1 })); // 1ms cooldown
      const conn = mockConnection({
        solLamports: 500_000_000,
        tokenAccounts: [{ mint: MINT_USDC, amount: '50000000', decimals: 6 }],
      });

      // First call
      await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      // Wait for cooldown to elapse (1ms)
      await new Promise((r) => setTimeout(r, 5));

      // Second call — cooldown passed → should trigger again
      const r2 = await fm.checkAndRebalance(conn, TEST_KEYPAIR);
      expect(r2.triggered).toBe(true);
      expect(r2.reason).toBe('sol_excess_swapped');
    });
  });

  describe('checkAndRebalance — error handling', () => {
    it('returns swap_failed when Jupiter quote throws, no throw propagated', async () => {
      vi.stubGlobal('fetch', mockJupiterFetch({ quoteError: true }));

      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 500_000_000,
        tokenAccounts: [{ mint: MINT_USDC, amount: '50000000', decimals: 6 }],
      });

      const result = await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('swap_failed');
      expect(result.error).toBeDefined();
    });

    it('returns swap_failed when executeJupiterSwap throws, lastRebalanceAt NOT updated', async () => {
      vi.stubGlobal('fetch', mockJupiterFetch({ swapError: true }));

      const fm = new FundingManager(makeConfig());
      const conn = mockConnection({
        solLamports: 500_000_000,
        tokenAccounts: [{ mint: MINT_USDC, amount: '50000000', decimals: 6 }],
      });

      const r1 = await fm.checkAndRebalance(conn, TEST_KEYPAIR);
      expect(r1.reason).toBe('swap_failed');

      // Since lastRebalanceAt was NOT updated, next call should NOT be blocked by cooldown
      const r2 = await fm.checkAndRebalance(conn, TEST_KEYPAIR);
      expect(r2.reason).not.toBe('cooldown');
    });
  });

  describe('checkAndRebalance — one swap per tick', () => {
    it('SOL excess takes priority over USDT normalization (only one swap)', async () => {
      vi.stubGlobal('fetch', mockJupiterFetch());
      vi.spyOn(VersionedTransaction, 'deserialize').mockReturnValue({
        sign: vi.fn(),
      } as unknown as VersionedTransaction);

      // SOL excess AND USDT balance both present
      const fm = new FundingManager(makeConfig({ rebalanceCooldownMs: 0 }));
      const conn = mockConnection({
        solLamports: 500_000_000,
        tokenAccounts: [
          { mint: MINT_USDC, amount: '50000000', decimals: 6 },
          { mint: MINT_USDT, amount: '20000000', decimals: 6 }, // $20 USDT
        ],
      });

      const result = await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      // SOL excess wins (Case 1 before Case 2)
      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('sol_excess_swapped');
      // Should NOT also normalize USDT in same tick
      expect(result.reason).not.toBe('usdt_normalized');
    });
  });

  describe('checkAndRebalance — post-swap snapshot refresh', () => {
    it('reflects new balances after successful swap', async () => {
      vi.stubGlobal('fetch', mockJupiterFetch());
      vi.spyOn(VersionedTransaction, 'deserialize').mockReturnValue({
        sign: vi.fn(),
      } as unknown as VersionedTransaction);

      const fm = new FundingManager(makeConfig());
      // The mock connection returns the same balance on every call,
      // so the post-swap snapshot will reflect these values.
      const conn = mockConnection({
        solLamports: 500_000_000,
        tokenAccounts: [{ mint: MINT_USDC, amount: '87500000', decimals: 6 }],
      });

      const result = await fm.checkAndRebalance(conn, TEST_KEYPAIR);

      expect(result.triggered).toBe(true);
      expect(result.reason).toBe('sol_excess_swapped');

      // Post-swap snapshot was taken (second takeSnapshot call)
      const snap = fm.getWalletSnapshot();
      expect(snap).not.toBeNull();
      expect(snap!.usdcBalance).toBeCloseTo(87.5, 1);
    });
  });
});
