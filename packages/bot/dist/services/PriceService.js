"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceService = void 0;
/**
 * Price service – fetches DEX quotes for arbitrage.
 * Supports Uniswap V3 (Quoter V2) + any V2-compatible router (Uniswap V2, SushiSwap).
 */
const ethers_1 = require("ethers");
const tokens_1 = require("../config/tokens");
const dexes_1 = require("../config/dexes");
const QUOTER_V2_ABI = [
    'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];
const V2_ROUTER_ABI = [
    'function getAmountsOut(uint256 amountIn, address[] path) external view returns (uint256[] amounts)',
];
const V3_FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
class PriceService {
    provider;
    quoterV3 = null;
    v2Routers = new Map();
    rateLimitedUntilMs = 0;
    lastRateLimitLogMs = 0;
    v3Enabled;
    constructor(provider) {
        this.provider = provider;
        // Resolve V3 quoter from DEX_CONFIG
        const v3Config = dexes_1.DEX_CONFIG['UNISWAP_V3'];
        const quoterAddr = v3Config?.quoter?.trim() || '';
        this.v3Enabled = Boolean(v3Config?.enabled && quoterAddr);
        if (this.v3Enabled && quoterAddr) {
            try {
                const checksummed = (0, ethers_1.getAddress)(quoterAddr.toLowerCase());
                this.quoterV3 = new ethers_1.Contract(checksummed, QUOTER_V2_ABI, provider);
                void this.logQuoterCheck(checksummed);
            }
            catch {
                console.warn('[PRICE_SERVICE_INIT] Invalid V3 quoter address, disabling V3:', quoterAddr);
            }
        }
        // Build V2 router contracts for all enabled V2 DEXes
        for (const [dexName, dexCfg] of Object.entries(dexes_1.DEX_CONFIG)) {
            if (!dexCfg.enabled || dexCfg.version !== 'v2' || !dexCfg.router)
                continue;
            try {
                const checksummed = (0, ethers_1.getAddress)(dexCfg.router.toLowerCase());
                this.v2Routers.set(dexName, new ethers_1.Contract(checksummed, V2_ROUTER_ABI, provider));
            }
            catch {
                console.warn(`[PRICE_SERVICE_INIT] Invalid V2 router address for ${dexName}:`, dexCfg.router);
            }
        }
        // Log once at startup so we can verify exactly which addresses are being used.
        console.log('[PRICE_SERVICE_INIT]', {
            v3Quoter: quoterAddr || 'DISABLED',
            v3Enabled: this.v3Enabled,
            v2Routers: Object.fromEntries([...this.v2Routers.entries()].map(([k, c]) => [k, c.target])),
        });
    }
    async getQuote(tokenInSymbol, tokenOutSymbol, amountIn, dex) {
        const nowMs = Date.now();
        if (nowMs < this.rateLimitedUntilMs) {
            return null;
        }
        let tokenInAddr;
        let tokenOutAddr;
        let decimalsIn;
        let decimalsOut;
        try {
            tokenInAddr = (0, tokens_1.getTokenAddress)(tokenInSymbol);
            tokenOutAddr = (0, tokens_1.getTokenAddress)(tokenOutSymbol);
            decimalsIn = (0, tokens_1.getTokenConfig)(tokenInSymbol).decimals;
            decimalsOut = (0, tokens_1.getTokenConfig)(tokenOutSymbol).decimals;
        }
        catch (error) {
            console.log('[QUOTE_FAIL]', {
                dex,
                pair: `${tokenInSymbol}/${tokenOutSymbol}`,
                reason: 'token_config_missing',
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
        const amountInBig = BigInt(amountIn);
        const now = Date.now();
        // V3 quote path
        if (dex === 'UNISWAP_V3' && this.quoterV3 && this.v3Enabled) {
            const quote = await this.getBestV3Quote(tokenInAddr, tokenOutAddr, amountInBig, decimalsIn, decimalsOut);
            if (!quote)
                return null;
            return {
                tokenIn: tokenInSymbol,
                tokenOut: tokenOutSymbol,
                amountIn,
                amountOut: quote.amountOut.toString(),
                dex: 'UNISWAP_V3',
                fee: quote.fee ?? 3000,
                timestamp: now,
            };
        }
        if (dex === 'UNISWAP_V3' && !this.v3Enabled) {
            return null;
        }
        // V2 quote path — supports any V2-compatible router (Uniswap V2, SushiSwap, etc.)
        const v2Router = this.v2Routers.get(dex);
        if (v2Router) {
            const quote = await this.getV2Quote(v2Router, dex, tokenInAddr, tokenOutAddr, amountInBig, decimalsIn, decimalsOut);
            if (!quote)
                return null;
            return {
                tokenIn: tokenInSymbol,
                tokenOut: tokenOutSymbol,
                amountIn,
                amountOut: quote.amountOut.toString(),
                dex,
                fee: dexes_1.DEX_CONFIG[dex]?.fee ? dexes_1.DEX_CONFIG[dex].fee * 10000 : 3000,
                timestamp: now,
            };
        }
        console.log('[QUOTE_FAIL]', {
            dex,
            pair: `${tokenInSymbol}/${tokenOutSymbol}`,
            reason: 'dex_not_supported_or_not_configured',
        });
        return null;
    }
    async getBestV3Quote(tokenIn, tokenOut, amountIn, _decimalsIn, _decimalsOut) {
        if (!this.quoterV3)
            return null;
        let best = null;
        for (const fee of V3_FEE_TIERS) {
            try {
                const result = await this.quoterV3.quoteExactInputSingle.staticCall({
                    tokenIn,
                    tokenOut,
                    amountIn,
                    fee,
                    sqrtPriceLimitX96: 0n,
                });
                const amountOut = typeof result === 'bigint' ? result : result[0];
                if (amountOut > 0n && (!best || amountOut > best.amountOut)) {
                    best = { amountOut, fee };
                }
            }
            catch (error) {
                this.handleRpcError('UNISWAP_V3', `${tokenIn}/${tokenOut}`, error, fee);
            }
        }
        return best;
    }
    async getV2Quote(router, dexName, tokenIn, tokenOut, amountIn, _decimalsIn, _decimalsOut) {
        try {
            const amounts = await router.getAmountsOut.staticCall(amountIn, [tokenIn, tokenOut]);
            const amountOut = Array.isArray(amounts) ? amounts[1] : amounts[1];
            if (amountOut && amountOut > 0n)
                return { amountOut };
        }
        catch (error) {
            this.handleRpcError(dexName, `${tokenIn}/${tokenOut}`, error);
        }
        return null;
    }
    handleRpcError(dex, pair, error, fee) {
        const message = error instanceof Error ? error.message : String(error);
        const isRateLimit = message.includes('Too Many Requests') || message.includes('code": -32005');
        if (isRateLimit) {
            this.rateLimitedUntilMs = Date.now() + 10_000;
            if (Date.now() - this.lastRateLimitLogMs > 10_000) {
                this.lastRateLimitLogMs = Date.now();
                console.warn('[QUOTE_BACKOFF]', {
                    dex,
                    pair,
                    fee,
                    reason: 'rpc_rate_limited',
                    backoffMs: 10_000,
                });
            }
            return;
        }
        console.log('[QUOTE_FAIL]', {
            dex,
            pair,
            fee,
            reason: `${dex.toLowerCase()}_quote_call_failed`,
            error: message,
        });
    }
    async logQuoterCheck(quoterAddress) {
        try {
            const code = await this.provider.getCode(quoterAddress);
            console.log('[V3_QUOTER_CHECK]', {
                address: quoterAddress,
                hasCode: code !== '0x',
                codeLength: code.length,
            });
        }
        catch (error) {
            console.log('[V3_QUOTER_CHECK_FAIL]', {
                address: quoterAddress,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
}
exports.PriceService = PriceService;
