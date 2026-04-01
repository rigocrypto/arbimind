import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('getEffectiveTokenPairs', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function setArbitrumProfile() {
    process.env['NETWORK'] = 'mainnet';
    process.env['EVM_CHAIN'] = 'arbitrum';
  }

  async function importTokens() {
    return await import('../../src/config/tokens');
  }

  it('includes USDC.e when SCAN_PAIRS contains USDC.e (case normalization)', async () => {
    setArbitrumProfile();
    process.env['SCAN_PAIRS'] = 'WETH/USDC,WETH/USDC.e,USDC/DAI';

    const { getEffectiveTokenPairs } = await importTokens();
    const pairs = getEffectiveTokenPairs();
    const pairStrings = pairs.map((p: { tokenA: string; tokenB: string }) => `${p.tokenA}/${p.tokenB}`);

    expect(pairStrings).toContain('WETH/USDC.e');
    expect(pairs.length).toBe(3);
  });

  it('includes USDC.e when SCAN_PAIRS is all-caps (WETH/USDC.E)', async () => {
    setArbitrumProfile();
    process.env['SCAN_PAIRS'] = 'WETH/USDC,WETH/USDC.E,USDC/DAI';

    const { getEffectiveTokenPairs } = await importTokens();
    const pairs = getEffectiveTokenPairs();
    const pairStrings = pairs.map((p: { tokenA: string; tokenB: string }) => `${p.tokenA}/${p.tokenB}`);

    expect(pairStrings).toContain('WETH/USDC.e');
  });

  it('includes USDC.e when SCAN_PAIRS has lowercase (weth/usdc.e)', async () => {
    setArbitrumProfile();
    process.env['SCAN_PAIRS'] = 'weth/usdc,weth/usdc.e,usdc/dai';

    const { getEffectiveTokenPairs } = await importTokens();
    const pairs = getEffectiveTokenPairs();
    const pairStrings = pairs.map((p: { tokenA: string; tokenB: string }) => `${p.tokenA}/${p.tokenB}`);

    expect(pairStrings).toContain('WETH/USDC.e');
    expect(pairs.length).toBe(3);
  });

  it('returns all Arbitrum pairs when SCAN_PAIRS is not set', async () => {
    setArbitrumProfile();
    delete process.env['SCAN_PAIRS'];

    const { getEffectiveTokenPairs } = await importTokens();
    const pairs = getEffectiveTokenPairs();

    expect(pairs.length).toBe(3);
  });

  it('handles reverse pair order in SCAN_PAIRS (USDC.e/WETH)', async () => {
    setArbitrumProfile();
    process.env['SCAN_PAIRS'] = 'USDC.e/WETH';

    const { getEffectiveTokenPairs } = await importTokens();
    const pairs = getEffectiveTokenPairs();
    const pairStrings = pairs.map((p: { tokenA: string; tokenB: string }) => `${p.tokenA}/${p.tokenB}`);

    expect(pairStrings).toContain('WETH/USDC.e');
  });
});
