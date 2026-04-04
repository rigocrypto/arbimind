import { describe, it, expect } from 'vitest';
import {
  ETH_TOKEN,
  USDC_TOKEN,
  USDT_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
  tokenKey,
  isSameToken,
  tokensForChain,
  tokenAddress,
  defaultPair,
  requiresApprovalReset,
  searchTokens,
  SWAP_TOKENS,
} from '../lib/evmSwapTokens';

// ---------------------------------------------------------------------------
// tokenKey
// ---------------------------------------------------------------------------
describe('tokenKey', () => {
  it('returns symbol for native ETH regardless of chain', () => {
    expect(tokenKey(ETH_TOKEN, 1)).toBe('ETH');
    expect(tokenKey(ETH_TOKEN, 42161)).toBe('ETH');
  });

  it('returns chainId:lowercase for ERC-20', () => {
    const key = tokenKey(USDC_TOKEN, 1);
    expect(key).toBe('1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  });

  it('falls back to symbol if address missing on given chain', () => {
    // USDC has no address on chain 999
    expect(tokenKey(USDC_TOKEN, 999)).toBe('USDC');
  });
});

// ---------------------------------------------------------------------------
// isSameToken
// ---------------------------------------------------------------------------
describe('isSameToken', () => {
  it('native ETH equals itself across chains', () => {
    expect(isSameToken(ETH_TOKEN, ETH_TOKEN, 1)).toBe(true);
    expect(isSameToken(ETH_TOKEN, ETH_TOKEN, 42161)).toBe(true);
  });

  it('ETH is not WETH', () => {
    expect(isSameToken(ETH_TOKEN, WETH_TOKEN, 1)).toBe(false);
  });

  it('same ERC-20 on same chain', () => {
    expect(isSameToken(USDC_TOKEN, USDC_TOKEN, 1)).toBe(true);
  });

  it('different ERC-20s on same chain', () => {
    expect(isSameToken(USDC_TOKEN, USDT_TOKEN, 1)).toBe(false);
  });

  it('uses address-based comparison, not object reference', () => {
    const usdcCopy = { ...USDC_TOKEN };
    expect(isSameToken(usdcCopy, USDC_TOKEN, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tokensForChain
// ---------------------------------------------------------------------------
describe('tokensForChain', () => {
  it('returns all 5 tokens for Ethereum mainnet', () => {
    const tokens = tokensForChain(1);
    expect(tokens).toHaveLength(5);
  });

  it('returns all 5 tokens for Arbitrum', () => {
    expect(tokensForChain(42161)).toHaveLength(5);
  });

  it('always includes native ETH', () => {
    const tokens = tokensForChain(999); // unknown chain
    expect(tokens.some((t) => t.isNative)).toBe(true);
  });

  it('excludes ERC-20s without an address on unknown chain', () => {
    const tokens = tokensForChain(999);
    expect(tokens).toHaveLength(1); // only native ETH
  });
});

// ---------------------------------------------------------------------------
// tokenAddress
// ---------------------------------------------------------------------------
describe('tokenAddress', () => {
  it('returns symbol for native ETH', () => {
    expect(tokenAddress(ETH_TOKEN, 1)).toBe('ETH');
  });

  it('returns on-chain address for ERC-20', () => {
    expect(tokenAddress(USDC_TOKEN, 1)).toBe('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
  });

  it('returns symbol fallback if ERC-20 has no address on chain', () => {
    expect(tokenAddress(USDC_TOKEN, 999)).toBe('USDC');
  });
});

// ---------------------------------------------------------------------------
// defaultPair
// ---------------------------------------------------------------------------
describe('defaultPair', () => {
  it('returns ETH → USDC for any supported chain', () => {
    for (const chainId of [1, 10, 42161, 8453]) {
      const [sell, buy] = defaultPair(chainId);
      expect(sell.symbol).toBe('ETH');
      expect(buy.symbol).toBe('USDC');
    }
  });

  it('pair tokens are not the same', () => {
    const [sell, buy] = defaultPair(1);
    expect(isSameToken(sell, buy, 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// requiresApprovalReset
// ---------------------------------------------------------------------------
describe('requiresApprovalReset', () => {
  it('returns true for USDT on Ethereum mainnet', () => {
    expect(requiresApprovalReset(USDT_TOKEN, 1)).toBe(true);
  });

  it('returns false for USDT on Arbitrum', () => {
    expect(requiresApprovalReset(USDT_TOKEN, 42161)).toBe(false);
  });

  it('returns false for native ETH', () => {
    expect(requiresApprovalReset(ETH_TOKEN, 1)).toBe(false);
  });

  it('returns false for USDC on any chain', () => {
    expect(requiresApprovalReset(USDC_TOKEN, 1)).toBe(false);
    expect(requiresApprovalReset(USDC_TOKEN, 42161)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// searchTokens
// ---------------------------------------------------------------------------
describe('searchTokens', () => {
  it('returns all tokens for empty query', () => {
    expect(searchTokens(SWAP_TOKENS, '')).toHaveLength(SWAP_TOKENS.length);
    expect(searchTokens(SWAP_TOKENS, '   ')).toHaveLength(SWAP_TOKENS.length);
  });

  it('matches by symbol (case-insensitive)', () => {
    expect(searchTokens(SWAP_TOKENS, 'usdc')).toHaveLength(1);
    expect(searchTokens(SWAP_TOKENS, 'USDC')[0].symbol).toBe('USDC');
  });

  it('matches by name', () => {
    const results = searchTokens(SWAP_TOKENS, 'Tether');
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('USDT');
  });

  it('matches partial strings', () => {
    // "eth" matches ETH and Tether and Wrapped Ether
    const results = searchTokens(SWAP_TOKENS, 'eth');
    expect(results.length).toBeGreaterThanOrEqual(2); // at least ETH and WETH
  });

  it('returns empty for no match', () => {
    expect(searchTokens(SWAP_TOKENS, 'ZZZZZ')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Data integrity
// ---------------------------------------------------------------------------
describe('token data integrity', () => {
  it('all supported chains have all 5 tokens', () => {
    for (const chainId of [1, 10, 42161, 8453]) {
      const tokens = tokensForChain(chainId);
      expect(tokens).toHaveLength(5);
    }
  });

  it('all ERC-20 addresses are 0x-prefixed and 42 chars', () => {
    for (const token of SWAP_TOKENS) {
      if (token.isNative) continue;
      for (const [, addr] of Object.entries(token.addresses)) {
        expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
      }
    }
  });

  it('USDC and USDT have 6 decimals', () => {
    expect(USDC_TOKEN.decimals).toBe(6);
    expect(USDT_TOKEN.decimals).toBe(6);
  });

  it('ETH, WETH, DAI have 18 decimals', () => {
    expect(ETH_TOKEN.decimals).toBe(18);
    expect(WETH_TOKEN.decimals).toBe(18);
    expect(DAI_TOKEN.decimals).toBe(18);
  });

  it('only ETH is native', () => {
    expect(ETH_TOKEN.isNative).toBe(true);
    for (const t of [USDC_TOKEN, USDT_TOKEN, WETH_TOKEN, DAI_TOKEN]) {
      expect(t.isNative).toBe(false);
    }
  });
});
