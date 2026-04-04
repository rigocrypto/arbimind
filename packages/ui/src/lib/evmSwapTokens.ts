/**
 * Curated token list for EVM swap modal.
 * All addresses verified against chain explorers (etherscan, arbiscan,
 * optimistic.etherscan, basescan) and CoinGecko — April 2026.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwapToken {
  /** Unique symbol used as display label */
  symbol: string;
  /** Human-readable name */
  name: string;
  /** Token decimals */
  decimals: number;
  /** `true` for native ETH (no contract address) */
  isNative: boolean;
  /** Contract address per chain — absent for native ETH */
  addresses: Partial<Record<number, `0x${string}`>>;
  /** Optional logo path (public dir or external URL) */
  logoURI?: string;
}

/** Stable identity key: `symbol` for native, `chainId:lowercaseAddress` for ERC-20 */
export type TokenKey = string;

// ---------------------------------------------------------------------------
// Token definitions
// ---------------------------------------------------------------------------

export const ETH_TOKEN: SwapToken = {
  symbol: 'ETH',
  name: 'Ether',
  decimals: 18,
  isNative: true,
  addresses: {},
};

export const USDC_TOKEN: SwapToken = {
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  isNative: false,
  addresses: {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
};

export const USDT_TOKEN: SwapToken = {
  symbol: 'USDT',
  name: 'Tether USD',
  decimals: 6,
  isNative: false,
  addresses: {
    1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    10: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    8453: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
};

export const WETH_TOKEN: SwapToken = {
  symbol: 'WETH',
  name: 'Wrapped Ether',
  decimals: 18,
  isNative: false,
  addresses: {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    10: '0x4200000000000000000000000000000000000006',
    42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    8453: '0x4200000000000000000000000000000000000006',
  },
};

export const DAI_TOKEN: SwapToken = {
  symbol: 'DAI',
  name: 'Dai Stablecoin',
  decimals: 18,
  isNative: false,
  addresses: {
    1: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    10: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    8453: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  },
};

/** Master list — order determines default display order */
export const SWAP_TOKENS: SwapToken[] = [
  ETH_TOKEN,
  USDC_TOKEN,
  USDT_TOKEN,
  WETH_TOKEN,
  DAI_TOKEN,
];

// Tokens that require approve(0) before a non-zero approve.
// Key: `chainId:lowercaseAddress`
const RESET_APPROVAL_TOKENS = new Set<string>([
  `1:${USDT_TOKEN.addresses[1]!.toLowerCase()}`,
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unique key for a token on a specific chain */
export function tokenKey(token: SwapToken, chainId: number): TokenKey {
  if (token.isNative) return token.symbol;
  const addr = token.addresses[chainId];
  return addr ? `${chainId}:${addr.toLowerCase()}` : token.symbol;
}

/** True when two tokens represent the same asset on the given chain */
export function isSameToken(a: SwapToken, b: SwapToken, chainId: number): boolean {
  return tokenKey(a, chainId) === tokenKey(b, chainId);
}

/** Return tokens available on the given chainId */
export function tokensForChain(chainId: number): SwapToken[] {
  return SWAP_TOKENS.filter((t) => t.isNative || t.addresses[chainId] != null);
}

/** Get the on-chain address to send to the backend / use in ERC-20 calls */
export function tokenAddress(token: SwapToken, chainId: number): string {
  if (token.isNative) return token.symbol; // backend resolves 'ETH'
  return token.addresses[chainId] ?? token.symbol;
}

/** Default sell/buy pair for any chain */
export function defaultPair(_chainId: number): [SwapToken, SwapToken] {
  return [ETH_TOKEN, USDC_TOKEN];
}

/** True if this token + chain requires approve(0) before approve(amount) */
export function requiresApprovalReset(token: SwapToken, chainId: number): boolean {
  if (token.isNative) return false;
  const addr = token.addresses[chainId];
  if (!addr) return false;
  return RESET_APPROVAL_TOKENS.has(`${chainId}:${addr.toLowerCase()}`);
}

/** Simple case-insensitive substring search across symbol + name */
export function searchTokens(tokens: SwapToken[], query: string): SwapToken[] {
  if (!query.trim()) return tokens;
  const q = query.trim().toLowerCase();
  return tokens.filter(
    (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
  );
}
