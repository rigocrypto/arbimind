import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('getEligibleDexesForPair', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env['PAIR_DEX_OVERRIDE'];
  });

  function setArbitrumProfile() {
    process.env['NETWORK'] = 'mainnet';
    process.env['EVM_CHAIN'] = 'arbitrum';
  }

  async function importDexes() {
    return await import('../../src/config/dexes');
  }

  it('returns V3 only for WETH/USDC on Arbitrum', async () => {
    setArbitrumProfile();
    const { getEligibleDexesForPair } = await importDexes();
    const dexes = getEligibleDexesForPair('WETH', 'USDC');
    const names = dexes.map(([n]: [string, unknown]) => n);

    expect(names).toContain('UNISWAP_V3');
    expect(names).not.toContain('SUSHISWAP');
  });

  it('returns V3 + Sushi for WETH/USDC.e on Arbitrum', async () => {
    setArbitrumProfile();
    const { getEligibleDexesForPair } = await importDexes();
    const dexes = getEligibleDexesForPair('WETH', 'USDC.e');
    const names = dexes.map(([n]: [string, unknown]) => n);

    expect(names).toContain('UNISWAP_V3');
    expect(names).toContain('SUSHISWAP');
  });

  it('returns V3 only for USDC/DAI on Arbitrum', async () => {
    setArbitrumProfile();
    const { getEligibleDexesForPair } = await importDexes();
    const dexes = getEligibleDexesForPair('USDC', 'DAI');
    const names = dexes.map(([n]: [string, unknown]) => n);

    expect(names).toContain('UNISWAP_V3');
    expect(names).not.toContain('SUSHISWAP');
  });

  it('returns all enabled DEXes for unknown pair on Arbitrum', async () => {
    setArbitrumProfile();
    const { getEligibleDexesForPair } = await importDexes();
    const dexes = getEligibleDexesForPair('WETH', 'WBTC');
    const names = dexes.map(([n]: [string, unknown]) => n);

    // Unknown pair — should return all enabled (V3 + Sushi on Arbitrum)
    expect(names).toContain('UNISWAP_V3');
    expect(names).toContain('SUSHISWAP');
  });

  it('falls back to all enabled DEXes when pair policy is empty', async () => {
    setArbitrumProfile();
    // Override WETH/USDC to list a DEX key that doesn't exist as enabled
    process.env['PAIR_DEX_OVERRIDE'] = 'WETH/USDC:NONEXISTENT_DEX';
    const { getEligibleDexesForPair } = await importDexes();
    const dexes = getEligibleDexesForPair('WETH', 'USDC');
    const names = dexes.map(([n]: [string, unknown]) => n);

    // Filter produces empty → fallback to all enabled
    expect(names).toContain('UNISWAP_V3');
    expect(names).toContain('SUSHISWAP');
  });

  it('respects PAIR_DEX_OVERRIDE env var', async () => {
    setArbitrumProfile();
    // Override WETH/USDC to include Sushi
    process.env['PAIR_DEX_OVERRIDE'] = 'WETH/USDC:UNISWAP_V3,SUSHISWAP';
    const { getEligibleDexesForPair } = await importDexes();
    const dexes = getEligibleDexesForPair('WETH', 'USDC');
    const names = dexes.map(([n]: [string, unknown]) => n);

    expect(names).toContain('UNISWAP_V3');
    expect(names).toContain('SUSHISWAP');
  });

  it('handles reverse pair lookup (DAI/USDC maps to USDC/DAI policy)', async () => {
    setArbitrumProfile();
    const { getEligibleDexesForPair } = await importDexes();
    const dexes = getEligibleDexesForPair('DAI', 'USDC');
    const names = dexes.map(([n]: [string, unknown]) => n);

    expect(names).toContain('UNISWAP_V3');
    expect(names).not.toContain('SUSHISWAP');
  });
});
