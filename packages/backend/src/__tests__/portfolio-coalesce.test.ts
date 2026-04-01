/**
 * Tests for in-flight request coalescing in portfolioService.
 * Verifies that concurrent getEvmPortfolio() calls for the same wallet
 * share a single scan rather than spawning parallel block-range queries.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

let mockQueryFilter: jest.Mock;
let mockGetBlockNumber: jest.Mock;
let mockGetNetwork: jest.Mock;

jest.mock('ethers', () => {
  mockQueryFilter = jest.fn().mockResolvedValue([]);
  mockGetBlockNumber = jest.fn().mockResolvedValue(35_000_000);
  mockGetNetwork = jest.fn().mockResolvedValue({ chainId: 1n });

  return {
    ethers: {
      JsonRpcProvider: jest.fn().mockImplementation(() => ({
        getBlockNumber: mockGetBlockNumber,
        getNetwork: mockGetNetwork,
      })),
      Contract: jest.fn().mockImplementation(() => ({
        filters: { Transfer: jest.fn().mockReturnValue({}) },
        queryFilter: mockQueryFilter,
      })),
      formatUnits: jest.fn().mockReturnValue('0.00'),
    },
  };
});

jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn(),
  PublicKey: jest.fn(),
}));

jest.mock('../services/priceService', () => ({
  getPricesUsd: jest.fn().mockResolvedValue({ ETH: 3000, USDC: 1 }),
}));

jest.mock('../utils/rpc', () => ({
  resolveRpcUrl: jest.fn().mockReturnValue('https://mock-rpc'),
}));

import { getEvmPortfolio, _resetPortfolioState } from '../services/portfolioService';

beforeEach(() => {
  _resetPortfolioState();
  process.env.EVM_ARB_ACCOUNT = '0x' + 'a'.repeat(40);
  mockQueryFilter.mockReset().mockResolvedValue([]);
  mockGetBlockNumber.mockReset().mockResolvedValue(35_000_000);
  mockGetNetwork.mockReset().mockResolvedValue({ chainId: 1n });
});

afterEach(() => {
  delete process.env.EVM_ARB_ACCOUNT;
});

const WALLET = '0x' + 'b'.repeat(40);

describe('portfolio scan coalescing', () => {
  it('single call creates one provider and returns a result', async () => {
    const result = await getEvmPortfolio(WALLET);
    expect(result).not.toBeNull();
    expect(result!.chain).toBe('evm');
    expect(mockGetNetwork).toHaveBeenCalledTimes(1);
  });

  it('concurrent calls for the same wallet share one scan', async () => {
    // Make the scan take time so concurrent calls overlap
    let resolveNetwork!: (v: { chainId: bigint }) => void;
    mockGetNetwork.mockImplementation(
      () => new Promise<{ chainId: bigint }>((resolve) => {
        resolveNetwork = resolve;
      })
    );

    const p1 = getEvmPortfolio(WALLET);
    const p2 = getEvmPortfolio(WALLET);
    const p3 = getEvmPortfolio(WALLET);

    // Only one provider creation / getNetwork call should happen
    expect(mockGetNetwork).toHaveBeenCalledTimes(1);

    // Resolve the scan
    resolveNetwork({ chainId: 1n });
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // All three should get the same result
    expect(r1).not.toBeNull();
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(mockGetNetwork).toHaveBeenCalledTimes(1);
  });

  it('different wallets run independent scans', async () => {
    const walletA = '0x' + 'c'.repeat(40);
    const walletB = '0x' + 'd'.repeat(40);

    const [a, b] = await Promise.all([
      getEvmPortfolio(walletA),
      getEvmPortfolio(walletB),
    ]);

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Two independent scans: getNetwork called twice
    expect(mockGetNetwork).toHaveBeenCalledTimes(2);
  });

  it('after scan completes, next call uses cache not a new scan', async () => {
    await getEvmPortfolio(WALLET);
    expect(mockGetNetwork).toHaveBeenCalledTimes(1);

    // Second call should hit cache, not create a new provider
    await getEvmPortfolio(WALLET);
    expect(mockGetNetwork).toHaveBeenCalledTimes(1);
  });

  it('after a failed scan, next call retries with a new scan', async () => {
    mockGetNetwork.mockRejectedValueOnce(new Error('RPC down'));

    const first = await getEvmPortfolio(WALLET);
    // Should return fallback (not null, because the catch returns a fallback summary)
    expect(first).not.toBeNull();
    expect(first!.totals.depositedUsd).toBe(0); // fallback has zero deposits

    // In-flight promise should be cleared. The fallback is cached with 10s TTL,
    // so clear cache to simulate TTL expiry and verify a fresh scan starts.
    _resetPortfolioState();
    mockGetNetwork.mockResolvedValueOnce({ chainId: 1n });
    const second = await getEvmPortfolio(WALLET);
    expect(second).not.toBeNull();
    expect(mockGetNetwork).toHaveBeenCalledTimes(2);
  });
});
