import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Connection } from '@solana/web3.js';

// ─────────────────────────────────────────────────────────────────
// N1: Solana auto-funding / rebalancing must honour LOG_ONLY.
//
// Before this fix FundingManager and SolanaInventoryManager never received
// LOG_ONLY, so with SOLANA_AUTO_FUND_ENABLED=true they signed and broadcast
// Jupiter swaps even when SOLANA_LOG_ONLY=true. Each scenario resolves its
// flags from the real env parsing in solana/config, then drives the real
// manager against fully mocked RPC/Jupiter: no network, no funded wallet.
//
// Every adversarial case has a counter-control that flips only LOG_ONLY and
// proves the same fixture DOES reach the (mocked) send -- so a pass here is
// not vacuous.
// ─────────────────────────────────────────────────────────────────

const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER = 'https://lite-api.jup.ag/swap/v1';
// Cold module import per scenario (env is read at module load). New tests
// only; existing test timeouts are deliberately left untouched.
const COLD_IMPORT_TIMEOUT_MS = 30_000;

type EnvFixture = Record<string, string | undefined>;

const ADVERSARIAL: EnvFixture = {
  SOLANA_LOG_ONLY: 'true',
  SOLANA_AUTO_FUND_ENABLED: 'true',
  SOLANA_AUTO_REBALANCE_ENABLED: 'true',
};
const DEFAULT_LOG_ONLY: EnvFixture = {
  SOLANA_LOG_ONLY: undefined,
  SOLANA_AUTO_FUND_ENABLED: 'true',
  SOLANA_AUTO_REBALANCE_ENABLED: 'true',
};
const CONTROL_LIVE: EnvFixture = {
  SOLANA_LOG_ONLY: 'false',
  SOLANA_AUTO_FUND_ENABLED: 'true',
  SOLANA_AUTO_REBALANCE_ENABLED: 'true',
};

async function loadWithEnv(env: EnvFixture) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const cfg = await import('../../src/solana/config');
  const { FundingManager } = await import('../../src/solana/FundingManager');
  const { SolanaInventoryManager } = await import('../../src/solana/InventoryManager');
  const web3 = await import('@solana/web3.js');
  return { cfg, FundingManager, SolanaInventoryManager, web3 };
}

/** 0.5 SOL + 50 USDC; with a 0.25 SOL target this is a $37.50 SOL-excess rebalance. */
function mockConnection() {
  const sendTransaction = vi.fn().mockResolvedValue('mock-sig');
  const confirmTransaction = vi.fn().mockResolvedValue({ value: { err: null } });
  const conn = {
    getBalance: vi.fn().mockResolvedValue(500_000_000),
    getParsedTokenAccountsByOwner: vi.fn().mockResolvedValue({
      value: [{ account: { data: { parsed: { info: { mint: MINT_USDC, tokenAmount: { amount: '50000000', decimals: 6 } } } } } }],
    }),
    sendTransaction,
    confirmTransaction,
    getTransaction: vi.fn().mockResolvedValue(null),
  } as unknown as Connection;
  return { conn, sendTransaction, confirmTransaction };
}

/** Jupiter: 1-SOL price quote -> $150; any other quote -> cheap swap quote; POST /swap -> tx. */
function mockJupiterFetch() {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST' && u.includes('/swap')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ swapTransaction: 'AAAA' }) });
    }
    if (u.includes('/quote') && u.includes('amount=1000000000')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ outAmount: '150000000' }) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ outAmount: '37500000', otherAmountThreshold: '37450000', priceImpactPct: '0.01', routePlan: [] }),
    });
  });
}

function swapQuoteCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url, init]) =>
    String(url).includes('/quote') && !String(url).includes('amount=1000000000') && init?.method !== 'POST');
}
function swapPostCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url, init]) => String(url).includes('/swap') && init?.method === 'POST');
}

function fundingConfig(logOnly: boolean | undefined, autoRebalanceEnabled: boolean) {
  return {
    logOnly: logOnly as boolean,
    autoRebalanceEnabled,
    targetSolReserve: 0.25,
    minSolReserve: 0.15,
    baseAssetMint: MINT_USDC,
    baseAsset: 'USDC' as const,
    minRebalanceUsd: 5,
    maxRebalanceNotionalUsd: 1_000,
    maxRebalanceCostBps: 30,
    rebalanceCooldownMs: 60_000,
    jupiterBaseUrl: JUPITER,
  };
}

function inventoryConfig(autoFundEnabled: boolean, autoRebalanceEnabled: boolean) {
  return {
    autoFundEnabled,
    autoRebalanceEnabled,
    baseAsset: 'USDC' as const,
    baseAssetMint: MINT_USDC,
    minSolReserve: 0.15,
    targetSolReserve: 0.25,
    autoFundMinSwapUsd: 0.5,
    maxRebalanceNotionalUsd: 1_000,
    fundingRebalanceIntervalMs: 60_000,
    fundingCooldownMs: 300_000,
    positionSizeFraction: 0.25,
    minTradeUsd: 0.2,
    maxTradeUsd: 250,
    compoundProfits: true,
    postTradeCooldownMs: 600_000,
    solRebalanceBandLow: 0.6,
    solRebalanceBandHigh: 1.8,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('N1 FundingManager honours Solana LOG_ONLY', () => {
  async function runFunding(env: EnvFixture) {
    const { cfg, FundingManager, web3 } = await loadWithEnv(env);
    const fetchMock = mockJupiterFetch();
    vi.stubGlobal('fetch', fetchMock);
    const sign = vi.fn();
    const deserialize = vi.spyOn(web3.VersionedTransaction, 'deserialize')
      .mockReturnValue({ sign } as unknown as InstanceType<typeof web3.VersionedTransaction>);
    const { conn, sendTransaction, confirmTransaction } = mockConnection();
    const fm = new FundingManager(fundingConfig(cfg.solanaExecutorConfig.logOnly, cfg.inventoryConfig.autoRebalanceEnabled));
    const result = await fm.checkAndRebalance(conn, web3.Keypair.generate());
    return { cfg, result, fetchMock, sign, deserialize, sendTransaction, confirmTransaction };
  }

  it('LOG_ONLY=true + AUTO_FUND=true + AUTO_REBALANCE=true: evaluates and quotes, never signs or sends', async () => {
    const r = await runFunding(ADVERSARIAL);

    expect(r.cfg.solanaExecutorConfig.logOnly).toBe(true);
    expect(r.cfg.inventoryConfig.autoFundEnabled).toBe(true);
    expect(r.cfg.inventoryConfig.autoRebalanceEnabled).toBe(true);

    expect(r.result).toMatchObject({ triggered: false, reason: 'log_only' });
    expect(swapQuoteCalls(r.fetchMock).length).toBeGreaterThan(0); // evaluation happened
    expect(swapPostCalls(r.fetchMock)).toHaveLength(0);
    expect(r.deserialize).not.toHaveBeenCalled();
    expect(r.sign).not.toHaveBeenCalled();
    expect(r.sendTransaction).not.toHaveBeenCalled();
    expect(r.confirmTransaction).not.toHaveBeenCalled();
  }, COLD_IMPORT_TIMEOUT_MS);

  it('SOLANA_LOG_ONLY unset resolves to log-only by default and never sends', async () => {
    const r = await runFunding(DEFAULT_LOG_ONLY);

    expect(r.cfg.solanaExecutorConfig.logOnly).toBe(true);
    expect(r.result).toMatchObject({ triggered: false, reason: 'log_only' });
    expect(r.sign).not.toHaveBeenCalled();
    expect(r.sendTransaction).not.toHaveBeenCalled();
  }, COLD_IMPORT_TIMEOUT_MS);

  it('counter-control: same fixture with SOLANA_LOG_ONLY=false reaches the mocked send', async () => {
    const r = await runFunding(CONTROL_LIVE);

    expect(r.cfg.solanaExecutorConfig.logOnly).toBe(false);
    expect(r.result).toMatchObject({ triggered: true, reason: 'sol_excess_swapped' });
    expect(swapPostCalls(r.fetchMock)).toHaveLength(1);
    expect(r.sign).toHaveBeenCalledTimes(1);
    expect(r.sendTransaction).toHaveBeenCalledTimes(1);
  }, COLD_IMPORT_TIMEOUT_MS);

  it('fails closed when a caller omits logOnly entirely', async () => {
    const { FundingManager, web3 } = await loadWithEnv(CONTROL_LIVE);
    vi.stubGlobal('fetch', mockJupiterFetch());
    const sign = vi.fn();
    vi.spyOn(web3.VersionedTransaction, 'deserialize')
      .mockReturnValue({ sign } as unknown as InstanceType<typeof web3.VersionedTransaction>);
    const { conn, sendTransaction } = mockConnection();
    const { logOnly: _omitted, ...withoutLogOnly } = fundingConfig(false, true);

    const fm = new FundingManager(withoutLogOnly as unknown as ReturnType<typeof fundingConfig>);
    const result = await fm.checkAndRebalance(conn, web3.Keypair.generate());

    expect(result).toMatchObject({ triggered: false, reason: 'log_only' });
    expect(sign).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  }, COLD_IMPORT_TIMEOUT_MS);
});

describe('N1 SolanaInventoryManager honours Solana LOG_ONLY', () => {
  async function runInventory(env: EnvFixture) {
    const { cfg, SolanaInventoryManager, web3 } = await loadWithEnv(env);
    const fetchMock = mockJupiterFetch();
    vi.stubGlobal('fetch', fetchMock);
    const sign = vi.fn();
    const deserialize = vi.spyOn(web3.VersionedTransaction, 'deserialize')
      .mockReturnValue({ sign } as unknown as InstanceType<typeof web3.VersionedTransaction>);
    const { conn, sendTransaction, confirmTransaction } = mockConnection();
    const mgr = new SolanaInventoryManager({
      config: inventoryConfig(cfg.inventoryConfig.autoFundEnabled, cfg.inventoryConfig.autoRebalanceEnabled),
      logOnly: cfg.solanaExecutorConfig.logOnly,
      jupiterBaseUrl: JUPITER,
      maxSlippageBps: 50,
      asLegacyTransaction: true,
      priorityFeeLamports: 100_000,
    });
    await mgr.runFundingRebalanceIfNeeded(conn, web3.Keypair.generate());
    return { cfg, mgr, conn, fetchMock, sign, deserialize, sendTransaction, confirmTransaction };
  }

  it('LOG_ONLY=true + AUTO_FUND=true + AUTO_REBALANCE=true: computes the rebalance, never signs or sends', async () => {
    const r = await runInventory(ADVERSARIAL);

    expect(r.cfg.solanaExecutorConfig.logOnly).toBe(true);
    expect((r.conn as unknown as { getBalance: ReturnType<typeof vi.fn> }).getBalance).toHaveBeenCalled();
    expect(r.mgr.needsFundingRebalance()).toBe(true); // a rebalance was genuinely due
    expect(swapQuoteCalls(r.fetchMock)).toHaveLength(0);
    expect(swapPostCalls(r.fetchMock)).toHaveLength(0);
    expect(r.deserialize).not.toHaveBeenCalled();
    expect(r.sign).not.toHaveBeenCalled();
    expect(r.sendTransaction).not.toHaveBeenCalled();
    expect(r.confirmTransaction).not.toHaveBeenCalled();
  }, COLD_IMPORT_TIMEOUT_MS);

  it('SOLANA_LOG_ONLY unset resolves to log-only by default and never sends', async () => {
    const r = await runInventory(DEFAULT_LOG_ONLY);

    expect(r.cfg.solanaExecutorConfig.logOnly).toBe(true);
    expect(r.sign).not.toHaveBeenCalled();
    expect(r.sendTransaction).not.toHaveBeenCalled();
  }, COLD_IMPORT_TIMEOUT_MS);

  it('counter-control: same fixture with SOLANA_LOG_ONLY=false reaches the mocked send', async () => {
    const r = await runInventory(CONTROL_LIVE);

    expect(r.cfg.solanaExecutorConfig.logOnly).toBe(false);
    expect(swapPostCalls(r.fetchMock).length).toBeGreaterThan(0);
    expect(r.sign).toHaveBeenCalled();
    expect(r.sendTransaction).toHaveBeenCalled();
  }, COLD_IMPORT_TIMEOUT_MS);
});
