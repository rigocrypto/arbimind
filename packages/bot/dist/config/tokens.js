"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllTokenAddresses = exports.getTokenConfig = exports.getTokenAddress = exports.getEffectiveTokenPairs = exports.getSepoliaPairs = exports.TOKEN_PAIRS = exports.ALLOWLISTED_TOKENS = void 0;
const DEFAULT_ALLOWLISTED_TOKENS = {
    WETH: {
        address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        symbol: "WETH",
        name: "Wrapped Ether",
        decimals: 18,
        logoURI: "https://assets.coingecko.com/coins/images/2518/thumb/weth.png"
    },
    USDC: {
        address: "0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8",
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
function normalizeEnvValue(value) {
    if (!value)
        return '';
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
}
function isEthereumSepoliaProfile() {
    const network = normalizeEnvValue(process.env['NETWORK'] || 'mainnet').toLowerCase();
    const evmChain = normalizeEnvValue(process.env['EVM_CHAIN'] || 'arbitrum').toLowerCase();
    return network === 'testnet' && evmChain === 'ethereum';
}
function buildSepoliaTokens() {
    const sepoliaTokens = {};
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
function buildTokenPairs(tokens) {
    if (!isEthereumSepoliaProfile()) {
        return DEFAULT_TOKEN_PAIRS;
    }
    const pairs = [];
    if (tokens['WETH'] && tokens['USDC'])
        pairs.push({ tokenA: 'WETH', tokenB: 'USDC' });
    if (tokens['WETH'] && tokens['DAI'])
        pairs.push({ tokenA: 'WETH', tokenB: 'DAI' });
    if (tokens['USDC'] && tokens['DAI'])
        pairs.push({ tokenA: 'USDC', tokenB: 'DAI' });
    return pairs;
}
exports.ALLOWLISTED_TOKENS = isEthereumSepoliaProfile() ? buildSepoliaTokens() : DEFAULT_ALLOWLISTED_TOKENS;
exports.TOKEN_PAIRS = buildTokenPairs(exports.ALLOWLISTED_TOKENS);
/** Sepolia pairs (symbols only). Use at runtime so scan never gets 0 pairs when env is set. */
function getSepoliaPairs() {
    return [
        { tokenA: 'WETH', tokenB: 'USDC' },
        { tokenA: 'WETH', tokenB: 'DAI' },
        { tokenA: 'USDC', tokenB: 'DAI' },
    ];
}
exports.getSepoliaPairs = getSepoliaPairs;
/** Pairs to use for scanning. On Sepolia, prefer explicit 3 pairs if TOKEN_PAIRS is empty. */
function getEffectiveTokenPairs() {
    const basePairs = isEthereumSepoliaProfile() && exports.TOKEN_PAIRS.length === 0
        ? getSepoliaPairs()
        : exports.TOKEN_PAIRS;
    const scanPairsEnv = normalizeEnvValue(process.env['SCAN_PAIRS']);
    const requestedPairs = new Set(scanPairsEnv
        .split(',')
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean));
    const pairs = requestedPairs.size > 0
        ? basePairs.filter((p) => requestedPairs.has(`${p.tokenA}/${p.tokenB}`) || requestedPairs.has(`${p.tokenB}/${p.tokenA}`))
        : basePairs;
    console.log('[EFFECTIVE_PAIRS]', {
        count: pairs.length,
        pairs: pairs.map((p) => `${p.tokenA}/${p.tokenB}`),
        scanPairsEnv: scanPairsEnv || 'ALL',
        WETH: process.env['SEPOLIA_WETH_ADDRESS']?.trim() || 'MISSING',
        USDC: process.env['SEPOLIA_USDC_ADDRESS']?.trim() || 'MISSING',
        DAI: process.env['SEPOLIA_DAI_ADDRESS']?.trim() || 'MISSING',
    });
    return pairs;
}
exports.getEffectiveTokenPairs = getEffectiveTokenPairs;
function getTokenAddress(symbol) {
    const token = exports.ALLOWLISTED_TOKENS[symbol];
    if (!token) {
        throw new Error(`Token ${symbol} not found in allowlist`);
    }
    return token.address;
}
exports.getTokenAddress = getTokenAddress;
function getTokenConfig(symbol) {
    const token = exports.ALLOWLISTED_TOKENS[symbol];
    if (!token) {
        throw new Error(`Token ${symbol} not found in allowlist`);
    }
    return token;
}
exports.getTokenConfig = getTokenConfig;
function getAllTokenAddresses() {
    return Object.values(exports.ALLOWLISTED_TOKENS).map(token => token.address);
}
exports.getAllTokenAddresses = getAllTokenAddresses;
