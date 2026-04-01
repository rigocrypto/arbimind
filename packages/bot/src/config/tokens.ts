import { getAddress } from 'ethers';

export interface TokenConfig {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

const DEFAULT_ALLOWLISTED_TOKENS: Record<string, TokenConfig> = {
  WETH: {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/2518/thumb/weth.png"
  },
  USDC: {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png"
  },
  USDT: {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoURI: "https://assets.coingecko.com/coins/images/325/thumb/Tether.png"
  },
  DAI: {
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/9956/thumb/4943.png"
  },
  WBTC: {
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    decimals: 8,
    logoURI: "https://assets.coingecko.com/coins/images/7598/thumb/wrapped_bitcoin_wbtc.png"
  },
  LINK: {
    address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/877/thumb/chainlink.png"
  },
  UNI: {
    address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    symbol: "UNI",
    name: "Uniswap",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/12504/thumb/uniswap-uni.png"
  },
  AAVE: {
    address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    symbol: "AAVE",
    name: "Aave",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/12645/thumb/AAVE.png"
  }
};

const DEFAULT_TOKEN_PAIRS = [
  { tokenA: "WETH", tokenB: "USDC" },
  { tokenA: "WETH", tokenB: "USDT" },
  { tokenA: "WETH", tokenB: "DAI" },
  { tokenA: "WETH", tokenB: "WBTC" },
  { tokenA: "USDC", tokenB: "USDT" },
  { tokenA: "USDC", tokenB: "DAI" },
  { tokenA: "USDT", tokenB: "DAI" },
  { tokenA: "WETH", tokenB: "LINK" },
  { tokenA: "WETH", tokenB: "UNI" },
  { tokenA: "WETH", tokenB: "AAVE" }
];

function normalizeEnvValue(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isEthereumSepoliaProfile(): boolean {
  const network = normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase();
  const evmChain = normalizeEnvValue(process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
  return network === 'testnet' && evmChain === 'ethereum';
}

function isArbitrumProfile(): boolean {
  const network = normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase();
  const evmChain = normalizeEnvValue(process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
  return network === 'mainnet' && evmChain === 'arbitrum';
}

function buildSepoliaTokens(): Record<string, TokenConfig> {
  const sepoliaTokens: Record<string, TokenConfig> = {};

  const weth = normalizeEnvValue(process.env['SEPOLIA_WETH_ADDRESS']) || '0x7b79995e5f793a07bc00c21412e50ecae098e7f9';
  if (weth) {
    sepoliaTokens['WETH'] = {
      address: weth,
      symbol: 'WETH',
      name: 'Wrapped Ether (Sepolia)',
      decimals: 18,
      logoURI: DEFAULT_ALLOWLISTED_TOKENS['WETH']?.logoURI,
    };
  }

  const usdc = normalizeEnvValue(process.env['SEPOLIA_USDC_ADDRESS']);
  if (usdc) {
    sepoliaTokens['USDC'] = {
      address: usdc,
      symbol: 'USDC',
      name: 'USD Coin (Sepolia)',
      decimals: 6,
      logoURI: DEFAULT_ALLOWLISTED_TOKENS['USDC']?.logoURI,
    };
  }

  const dai = normalizeEnvValue(process.env['SEPOLIA_DAI_ADDRESS']);
  if (dai) {
    sepoliaTokens['DAI'] = {
      address: dai,
      symbol: 'DAI',
      name: 'Dai (Sepolia)',
      decimals: 18,
      logoURI: DEFAULT_ALLOWLISTED_TOKENS['DAI']?.logoURI,
    };
  }

  return sepoliaTokens;
}

const ARBITRUM_ALLOWLISTED_TOKENS: Record<string, TokenConfig> = {
  WETH: {
    address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    symbol: 'WETH',
    name: 'Wrapped Ether (Arbitrum)',
    decimals: 18,
    logoURI: DEFAULT_ALLOWLISTED_TOKENS['WETH']?.logoURI,
  },
  USDC: {
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    symbol: 'USDC',
    name: 'USD Coin (Arbitrum Native)',
    decimals: 6,
    logoURI: DEFAULT_ALLOWLISTED_TOKENS['USDC']?.logoURI,
  },
  USDT: {
    address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    symbol: 'USDT',
    name: 'Tether USD (Arbitrum)',
    decimals: 6,
    logoURI: DEFAULT_ALLOWLISTED_TOKENS['USDT']?.logoURI,
  },
  DAI: {
    address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    symbol: 'DAI',
    name: 'Dai Stablecoin (Arbitrum)',
    decimals: 18,
    logoURI: DEFAULT_ALLOWLISTED_TOKENS['DAI']?.logoURI,
  },
  WBTC: {
    address: '0x2f2a2543b6822D9A882063FDA12032f94A611C5d',
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin (Arbitrum)',
    decimals: 8,
    logoURI: DEFAULT_ALLOWLISTED_TOKENS['WBTC']?.logoURI,
  },
  ARB: {
    address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    symbol: 'ARB',
    name: 'Arbitrum',
    decimals: 18,
    logoURI: 'https://assets.coingecko.com/coins/images/16547/thumb/photo_2023-03-29_21.47.00.jpeg',
  },
  LINK: {
    address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
    symbol: 'LINK',
    name: 'Chainlink (Arbitrum)',
    decimals: 18,
    logoURI: DEFAULT_ALLOWLISTED_TOKENS['LINK']?.logoURI,
  },
  'USDC.e': {
    address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    symbol: 'USDC.e',
    name: 'Bridged USDC (Arbitrum)',
    decimals: 6,
    logoURI: DEFAULT_ALLOWLISTED_TOKENS['USDC']?.logoURI,
  },
};

const ARBITRUM_TOKEN_PAIRS = [
  { tokenA: 'WETH', tokenB: 'USDC' },
  { tokenA: 'WETH', tokenB: 'USDC.e' },
  { tokenA: 'USDC', tokenB: 'DAI' },
];

function buildTokenPairs(tokens: Record<string, TokenConfig>): Array<{ tokenA: string; tokenB: string }> {
  if (isArbitrumProfile()) {
    return ARBITRUM_TOKEN_PAIRS;
  }
  if (!isEthereumSepoliaProfile()) {
    return DEFAULT_TOKEN_PAIRS;
  }

  const pairs: Array<{ tokenA: string; tokenB: string }> = [];
  if (tokens['WETH'] && tokens['USDC']) pairs.push({ tokenA: 'WETH', tokenB: 'USDC' });
  if (tokens['WETH'] && tokens['DAI']) pairs.push({ tokenA: 'WETH', tokenB: 'DAI' });
  if (tokens['USDC'] && tokens['DAI']) pairs.push({ tokenA: 'USDC', tokenB: 'DAI' });
  return pairs;
}

/** Validate all token addresses are valid EIP-55 checksummed addresses. Fail fast on bad config. */
function validateTokenAddresses(tokens: Record<string, TokenConfig>, label: string): Record<string, TokenConfig> {
  for (const [symbol, token] of Object.entries(tokens)) {
    if (!token.address) continue; // Skip empty (e.g. Sepolia tokens not set)
    try {
      const checksummed = getAddress(token.address);
      if (checksummed !== token.address) {
        console.warn(`[CONFIG_WARN] ${label} token ${symbol} address auto-corrected to checksummed form`);
        token.address = checksummed;
      }
    } catch {
      throw new Error(`[CONFIG_FATAL] ${label} token ${symbol} has invalid address: ${token.address}`);
    }
  }
  return tokens;
}

function resolveTokens(): Record<string, TokenConfig> {
  if (isArbitrumProfile()) return validateTokenAddresses(ARBITRUM_ALLOWLISTED_TOKENS, 'Arbitrum');
  if (isEthereumSepoliaProfile()) return validateTokenAddresses(buildSepoliaTokens(), 'Sepolia');
  return validateTokenAddresses(DEFAULT_ALLOWLISTED_TOKENS, 'Ethereum');
}

export const ALLOWLISTED_TOKENS: Record<string, TokenConfig> = resolveTokens();

export const TOKEN_PAIRS = buildTokenPairs(ALLOWLISTED_TOKENS);

/** Sepolia pairs (symbols only). Use at runtime so scan never gets 0 pairs when env is set. */
export function getSepoliaPairs(): Array<{ tokenA: string; tokenB: string }> {
  return [
    { tokenA: 'WETH', tokenB: 'USDC' },
    { tokenA: 'WETH', tokenB: 'DAI' },
    { tokenA: 'USDC', tokenB: 'DAI' },
  ];
}

/** Pairs to use for scanning. On Sepolia, prefer explicit 3 pairs if TOKEN_PAIRS is empty. */
export function getEffectiveTokenPairs(): Array<{ tokenA: string; tokenB: string }> {
  const basePairs = isEthereumSepoliaProfile() && TOKEN_PAIRS.length === 0
    ? getSepoliaPairs()
    : TOKEN_PAIRS;

  const scanPairsEnv = normalizeEnvValue(process.env['SCAN_PAIRS']);
  const requestedPairs = new Set(
    scanPairsEnv
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean)
  );

  const pairs = requestedPairs.size > 0
    ? basePairs.filter((p) => requestedPairs.has(`${p.tokenA}/${p.tokenB}`) || requestedPairs.has(`${p.tokenB}/${p.tokenA}`))
    : basePairs;

  const isSepolia = isEthereumSepoliaProfile();
  console.log('[EFFECTIVE_PAIRS]', {
    count: pairs.length,
    pairs: pairs.map((p) => `${p.tokenA}/${p.tokenB}`),
    scanPairsEnv: scanPairsEnv || 'ALL',
    profile: isSepolia ? 'sepolia' : isArbitrumProfile() ? 'arbitrum' : 'ethereum',
    WETH: ALLOWLISTED_TOKENS['WETH']?.address || 'MISSING',
    USDC: ALLOWLISTED_TOKENS['USDC']?.address || 'MISSING',
    DAI: ALLOWLISTED_TOKENS['DAI']?.address || 'MISSING',
  });

  return pairs;
}

export function getTokenAddress(symbol: string): string {
  const token = ALLOWLISTED_TOKENS[symbol];
  if (!token) {
    throw new Error(`Token ${symbol} not found in allowlist`);
  }
  return token.address;
}

export function getTokenConfig(symbol: string): TokenConfig {
  const token = ALLOWLISTED_TOKENS[symbol];
  if (!token) {
    throw new Error(`Token ${symbol} not found in allowlist`);
  }
  return token;
}

export function getAllTokenAddresses(): string[] {
  return Object.values(ALLOWLISTED_TOKENS).map(token => token.address);
}
