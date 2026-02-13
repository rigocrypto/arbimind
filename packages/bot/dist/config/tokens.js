"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllTokenAddresses = exports.getTokenConfig = exports.getTokenAddress = exports.TOKEN_PAIRS = exports.ALLOWLISTED_TOKENS = void 0;
exports.ALLOWLISTED_TOKENS = {
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
exports.TOKEN_PAIRS = [
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
