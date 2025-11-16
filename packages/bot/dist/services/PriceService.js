"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceService = void 0;
const ethers_1 = require("ethers");
const https_1 = __importDefault(require("https"));
const config_1 = require("../config");
const tokens_1 = require("../config/tokens");
const Logger_1 = require("../utils/Logger");
class PriceService {
    provider;
    logger;
    constructor(provider) {
        this.provider = provider;
        this.logger = new Logger_1.Logger('PriceService');
    }
    /**
     * Get a price quote from a specific DEX
     */
    async getQuote(tokenIn, tokenOut, amountIn, dexName) {
        try {
            const dexConfig = config_1.DEX_CONFIG[dexName];
            if (!dexConfig || !dexConfig.enabled) {
                return null;
            }
            if (dexConfig.version === 'v2') {
                return await this.getV2Quote(tokenIn, tokenOut, amountIn, dexName);
            }
            else if (dexConfig.version === 'v3') {
                return await this.getV3Quote(tokenIn, tokenOut, amountIn, dexName);
            }
            return null;
        }
        catch (error) {
            this.logger.debug(`Failed to get quote from ${dexName}`, {
                error: error instanceof Error ? error.message : error
            });
            return null;
        }
    }
    /**
     * Get quote from Uniswap V2 style DEX
     */
    async getV2Quote(tokenIn, tokenOut, amountIn, dexName) {
        try {
            const dexConfig = config_1.DEX_CONFIG[dexName];
            const factoryAddress = dexConfig?.factory;
            // If factory address is missing, we can't proceed
            if (!factoryAddress)
                return null;
            // Get pool reserves
            const poolAddress = await this.getV2PoolAddress(factoryAddress, tokenIn, tokenOut);
            if (!poolAddress) {
                return null;
            }
            const reserves = await this.getV2Reserves(poolAddress, tokenIn, tokenOut);
            if (!reserves) {
                return null;
            }
            // Calculate output amount using constant product formula
            const amountOut = this.calculateV2Output(amountIn, reserves.reserveIn, reserves.reserveOut, dexConfig?.fee || 0.003);
            const quote = {
                tokenIn,
                tokenOut,
                amountIn,
                amountOut: amountOut.toString(),
                dex: dexName,
                fee: dexConfig?.fee || 0.003,
                timestamp: Date.now()
            };
            // Hardening checks: stale price, slippage, and Coingecko cross-check
            const PRICE_STALE_MS = 15_000; // 15s
            const MAX_SLIPPAGE = 0.005; // 0.5%
            if (Date.now() - quote.timestamp > PRICE_STALE_MS) {
                this.logger.warn('Stale price quote detected', { quote });
                return null;
            }
            // Try cross-validate with Coingecko when token symbols are known
            const symbolIn = this.findSymbolByAddress(tokenIn);
            const symbolOut = this.findSymbolByAddress(tokenOut);
            if (symbolIn && symbolOut) {
                const [priceIn, priceOut] = await Promise.all([
                    this.fetchCoingeckoPrice(symbolIn),
                    this.fetchCoingeckoPrice(symbolOut)
                ]);
                if (priceIn && priceOut) {
                    // implied ratio: tokenOut per tokenIn
                    const cfgIn = tokens_1.ALLOWLISTED_TOKENS[symbolIn];
                    const cfgOut = tokens_1.ALLOWLISTED_TOKENS[symbolOut];
                    if (!cfgIn || !cfgOut)
                        return quote;
                    const decimalsIn = cfgIn.decimals;
                    const decimalsOut = cfgOut.decimals;
                    const amountOutUnits = Number(ethers_1.ethers.formatUnits(amountOut, decimalsOut));
                    const amountInUnits = Number(ethers_1.ethers.formatUnits(ethers_1.ethers.getBigInt(amountIn), decimalsIn));
                    if (amountInUnits > 0) {
                        const impliedRatio = amountOutUnits / amountInUnits;
                        const coingeckoRatio = priceIn / priceOut; // tokenOut per tokenIn
                        const deviation = Math.abs(impliedRatio - coingeckoRatio) / coingeckoRatio;
                        if (deviation > MAX_SLIPPAGE) {
                            this.logger.warn('Excessive slippage detected vs Coingecko', { deviation, quote, coingeckoRatio, impliedRatio });
                            return null;
                        }
                        if (deviation > 0.02) {
                            this.logger.warn('Price deviates >2% from Coingecko', { deviation, quote });
                        }
                    }
                }
            }
            return quote;
        }
        catch (error) {
            this.logger.debug(`V2 quote failed for ${dexName}`, {
                error: error instanceof Error ? error.message : error
            });
            return null;
        }
    }
    /**
     * Get quote from Uniswap V3 style DEX
     */
    async getV3Quote(tokenIn, tokenOut, amountIn, dexName) {
        try {
            const dexConfig = config_1.DEX_CONFIG[dexName];
            if (!dexConfig?.quoter) {
                return null;
            }
            // Use the quoter contract to get exact output
            const quoterContract = new ethers_1.ethers.Contract(dexConfig.quoter, [
                'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)'
            ], this.provider);
            const amountOut = await quoterContract['quoteExactInputSingle']?.(tokenIn, tokenOut, dexConfig?.feeTiers?.[1] || 3000, // Default to 0.3% fee tier
            amountIn, 0 // sqrtPriceLimitX96
            );
            const quote = {
                tokenIn,
                tokenOut,
                amountIn,
                amountOut: amountOut.toString(),
                dex: dexName,
                fee: dexConfig?.fee || 0.003,
                timestamp: Date.now()
            };
            // Same hardening as V2
            const PRICE_STALE_MS = 15_000; // 15s
            const MAX_SLIPPAGE = 0.005; // 0.5%
            if (Date.now() - quote.timestamp > PRICE_STALE_MS) {
                this.logger.warn('Stale price quote detected', { quote });
                return null;
            }
            const symbolIn = this.findSymbolByAddress(tokenIn);
            const symbolOut = this.findSymbolByAddress(tokenOut);
            if (symbolIn && symbolOut) {
                const [priceIn, priceOut] = await Promise.all([
                    this.fetchCoingeckoPrice(symbolIn),
                    this.fetchCoingeckoPrice(symbolOut)
                ]);
                if (priceIn && priceOut) {
                    const cfgIn = tokens_1.ALLOWLISTED_TOKENS[symbolIn];
                    const cfgOut = tokens_1.ALLOWLISTED_TOKENS[symbolOut];
                    if (!cfgIn || !cfgOut)
                        return quote;
                    const decimalsIn = cfgIn.decimals;
                    const decimalsOut = cfgOut.decimals;
                    const amountOutUnits = Number(ethers_1.ethers.formatUnits(amountOut, decimalsOut));
                    const amountInUnits = Number(ethers_1.ethers.formatUnits(ethers_1.ethers.getBigInt(amountIn), decimalsIn));
                    if (amountInUnits > 0) {
                        const impliedRatio = amountOutUnits / amountInUnits;
                        const coingeckoRatio = priceIn / priceOut;
                        const deviation = Math.abs(impliedRatio - coingeckoRatio) / coingeckoRatio;
                        if (deviation > MAX_SLIPPAGE) {
                            this.logger.warn('Excessive slippage detected vs Coingecko', { deviation, quote, coingeckoRatio, impliedRatio });
                            return null;
                        }
                        if (deviation > 0.02) {
                            this.logger.warn('Price deviates >2% from Coingecko', { deviation, quote });
                        }
                    }
                }
            }
            return quote;
        }
        catch (error) {
            this.logger.debug(`V3 quote failed for ${dexName}`, {
                error: error instanceof Error ? error.message : error
            });
            return null;
        }
    }
    /**
     * Find token symbol by on-chain address using allowlist
     */
    findSymbolByAddress(address) {
        const lower = address.toLowerCase();
        for (const [symbol, cfg] of Object.entries(tokens_1.ALLOWLISTED_TOKENS)) {
            if (cfg.address.toLowerCase() === lower)
                return symbol;
        }
        return null;
    }
    /**
     * Fetch USD price from Coingecko for known token symbols
     */
    async fetchCoingeckoPrice(symbol) {
        const COINGECKO_IDS = {
            WETH: 'weth',
            USDC: 'usd-coin',
            USDT: 'tether',
            DAI: 'dai',
            WBTC: 'wrapped-bitcoin',
            LINK: 'chainlink',
            UNI: 'uniswap',
            AAVE: 'aave'
        };
        const id = COINGECKO_IDS[symbol];
        if (!id)
            return null;
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
        return new Promise((resolve) => {
            try {
                https_1.default.get(url, (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data || '{}');
                            const price = json[id]?.usd;
                            resolve(typeof price === 'number' ? price : null);
                        }
                        catch (e) {
                            resolve(null);
                        }
                    });
                }).on('error', () => resolve(null));
            }
            catch (e) {
                resolve(null);
            }
        });
    }
    /**
     * Get V2 pool address from factory
     */
    async getV2PoolAddress(factoryAddress, tokenA, tokenB) {
        try {
            const factory = new ethers_1.ethers.Contract(factoryAddress, [
                'function getPair(address tokenA, address tokenB) external view returns (address pair)'
            ], this.provider);
            const poolAddress = await factory['getPair']?.(tokenA, tokenB);
            if (!poolAddress || poolAddress === ethers_1.ethers.ZeroAddress)
                return null;
            return poolAddress;
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Get V2 pool reserves
     */
    async getV2Reserves(poolAddress, tokenIn, _tokenOut) {
        try {
            const pool = new ethers_1.ethers.Contract(poolAddress, [
                'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
                'function token0() external view returns (address)',
                'function token1() external view returns (address)'
            ], this.provider);
            const [token0, reserves] = await Promise.all([
                pool['token0']?.(),
                pool['getReserves']?.()
            ]);
            if (!token0 || !reserves)
                return null;
            const [reserve0, reserve1] = reserves;
            if (token0.toLowerCase() === tokenIn.toLowerCase()) {
                return { reserveIn: reserve0, reserveOut: reserve1 };
            }
            else {
                return { reserveIn: reserve1, reserveOut: reserve0 };
            }
        }
        catch (error) {
            return null;
        }
    }
    /**
     * Calculate V2 output amount using constant product formula
     */
    calculateV2Output(amountIn, reserveIn, reserveOut, fee) {
        const amountInBig = ethers_1.ethers.getBigInt(amountIn);
        const feeNumerator = BigInt(Math.floor((1 - fee) * 1000));
        const feeDenominator = BigInt(1000);
        const amountInWithFee = amountInBig * feeNumerator;
        const numerator = amountInWithFee * reserveOut;
        const denominator = (reserveIn * feeDenominator) + amountInWithFee;
        return numerator / denominator;
    }
    /**
     * Get pool information
     */
    async getPoolInfo(poolAddress, dexName) {
        try {
            const dexConfig = config_1.DEX_CONFIG[dexName];
            if (!dexConfig) {
                return null;
            }
            const pool = new ethers_1.ethers.Contract(poolAddress, [
                'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
                'function token0() external view returns (address)',
                'function token1() external view returns (address)'
            ], this.provider);
            const [token0, token1, reserves] = await Promise.all([
                pool['token0']?.(),
                pool['token1']?.(),
                pool['getReserves']?.()
            ]);
            if (!token0 || !token1 || !reserves)
                return null;
            const [reserve0, reserve1] = reserves;
            const liquidity = reserve0 + reserve1;
            return {
                address: poolAddress,
                token0,
                token1,
                reserve0: reserve0.toString(),
                reserve1: reserve1.toString(),
                fee: dexConfig?.fee || 0.003,
                dex: dexName,
                liquidity: liquidity.toString()
            };
        }
        catch (error) {
            return null;
        }
    }
}
exports.PriceService = PriceService;
//# sourceMappingURL=PriceService.js.map