"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceService = void 0;
/**
 * Price service – fetches DEX quotes for arbitrage.
 * Uniswap V3 (Quoter V2) + Uniswap V2 on Ethereum Sepolia.
 */
const ethers_1 = require("ethers");
const tokens_1 = require("../config/tokens");
const QUOTER_V2_ABI = [
    'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];
const V2_ROUTER_ABI = [
    'function getAmountsOut(uint256 amountIn, address[] path) external view returns (uint256[] amounts)',
];
const V3_FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
const MAINNET_V3_QUOTER = '0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6';
const MAINNET_V2_ROUTER = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
function normalizeAddress(value) {
    return (value || '').trim().toLowerCase();
}
function isEthereumSepoliaProfile() {
    const network = (process.env['NETWORK'] || '').trim().toLowerCase();
    const evmChain = (process.env['EVM_CHAIN'] || '').trim().toLowerCase();
    return network === 'testnet' && evmChain === 'ethereum';
}
function isV3QuotesEnabled() {
    const value = (process.env['ENABLE_V3_QUOTES'] || process.env['SEPOLIA_ENABLE_V3_QUOTES'] || 'true')
        .trim()
        .toLowerCase();
    return value !== 'false' && value !== '0' && value !== 'no' && value !== 'off';
}
function resolveAddress(primaryEnv, fallbackEnv, label) {
    const raw = (process.env[primaryEnv] || process.env[fallbackEnv] || '').trim();
    if (!raw)
        return '';
    try {
        // Lowercase first so non-checksummed mixed-case env values are accepted and canonicalized.
        return (0, ethers_1.getAddress)(raw.toLowerCase());
    }
    catch {
        throw new Error(`Invalid address for ${label}: ${raw}`);
    }
}
function isSepoliaQuoterConfigured() {
    return Boolean(resolveAddress('SEPOLIA_UNISWAP_V3_QUOTER', 'UNISWAP_V3_QUOTER', 'SEPOLIA_UNISWAP_V3_QUOTER'));
}
function isSepoliaV2Configured() {
    return Boolean(resolveAddress('SEPOLIA_UNISWAP_V2_ROUTER', 'UNISWAP_V2_ROUTER', 'SEPOLIA_UNISWAP_V2_ROUTER'));
}
class PriceService {
    provider;
    quoterV3 = null;
    routerV2 = null;
    rateLimitedUntilMs = 0;
    lastRateLimitLogMs = 0;
    v3Enabled;
    constructor(provider) {
        this.provider = provider;
        const quoterAddr = resolveAddress('SEPOLIA_UNISWAP_V3_QUOTER', 'UNISWAP_V3_QUOTER', 'SEPOLIA_UNISWAP_V3_QUOTER');
        const routerAddr = resolveAddress('SEPOLIA_UNISWAP_V2_ROUTER', 'UNISWAP_V2_ROUTER', 'SEPOLIA_UNISWAP_V2_ROUTER');
        const isSepolia = isEthereumSepoliaProfile();
        this.v3Enabled = isV3QuotesEnabled();
        if (isSepolia && (!quoterAddr || !routerAddr)) {
            throw new Error('Missing Sepolia DEX configuration: set SEPOLIA_UNISWAP_V3_QUOTER and SEPOLIA_UNISWAP_V2_ROUTER');
        }
        if (isSepolia && normalizeAddress(quoterAddr) === MAINNET_V3_QUOTER) {
            throw new Error('Invalid Sepolia config: SEPOLIA_UNISWAP_V3_QUOTER points to mainnet quoter 0xb273...');
        }
        if (isSepolia && normalizeAddress(routerAddr) === MAINNET_V2_ROUTER) {
            throw new Error('Invalid Sepolia config: SEPOLIA_UNISWAP_V2_ROUTER points to mainnet router 0x7a25...');
        }
        if (quoterAddr && this.v3Enabled) {
            this.quoterV3 = new ethers_1.Contract(quoterAddr, QUOTER_V2_ABI, provider);
            void this.logQuoterCheck(quoterAddr);
        }
        if (routerAddr) {
            this.routerV2 = new ethers_1.Contract(routerAddr, V2_ROUTER_ABI, provider);
        }
        // Log once at startup so we can verify exactly which addresses are being used.
        console.log('[PRICE_SERVICE_INIT]', {
            v3Quoter: quoterAddr || 'MISSING',
            v2Router: routerAddr || 'MISSING',
            v3Enabled: this.v3Enabled,
            mode: isSepolia ? 'sepolia' : 'generic',
        });
    }
    async getQuote(tokenInSymbol, tokenOutSymbol, amountIn, dex) {
        const nowMs = Date.now();
        if (nowMs < this.rateLimitedUntilMs) {
            return null;
        }
        if (!isSepoliaQuoterConfigured() && !isSepoliaV2Configured()) {
            console.log('[QUOTE_FAIL]', {
                dex,
                pair: `${tokenInSymbol}/${tokenOutSymbol}`,
                reason: 'missing_sepolia_quoter_and_v2_router',
            });
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
        if (dex === 'UNISWAP_V3' && this.quoterV3) {
            const quote = await this.getBestV3Quote(tokenInAddr, tokenOutAddr, amountInBig, decimalsIn, decimalsOut);
            if (!quote) {
                // Keep this lightweight; detailed per-fee errors are logged only when useful.
                return null;
            }
            return {
                tokenIn: tokenInSymbol,
                tokenOut: tokenOutSymbol,
                amountIn: amountIn,
                amountOut: quote.amountOut.toString(),
                dex: 'UNISWAP_V3',
                fee: quote.fee ?? 3000,
                timestamp: now,
            };
        }
        if (dex === 'UNISWAP_V3' && !this.v3Enabled) {
            return null;
        }
        if (dex === 'UNISWAP_V2' && this.routerV2) {
            const quote = await this.getV2Quote(tokenInAddr, tokenOutAddr, amountInBig, decimalsIn, decimalsOut);
            if (!quote) {
                // Keep this lightweight; the underlying call failure logs include details.
                return null;
            }
            return {
                tokenIn: tokenInSymbol,
                tokenOut: tokenOutSymbol,
                amountIn: amountIn,
                amountOut: quote.amountOut.toString(),
                dex: 'UNISWAP_V2',
                fee: 3000,
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
    async getV2Quote(tokenIn, tokenOut, amountIn, _decimalsIn, _decimalsOut) {
        if (!this.routerV2)
            return null;
        try {
            const amounts = await this.routerV2.getAmountsOut.staticCall(amountIn, [tokenIn, tokenOut]);
            const amountOut = Array.isArray(amounts) ? amounts[1] : amounts[1];
            if (amountOut && amountOut > 0n)
                return { amountOut };
        }
        catch (error) {
            this.handleRpcError('UNISWAP_V2', `${tokenIn}/${tokenOut}`, error);
        }
        return null;
    }
    handleRpcError(dex, pair, error, fee) {
        const message = error instanceof Error ? error.message : String(error);
        const isRateLimit = message.includes('Too Many Requests') || message.includes('code": -32005');
        if (isRateLimit) {
            this.rateLimitedUntilMs = Date.now() + 10000;
            if (Date.now() - this.lastRateLimitLogMs > 10000) {
                this.lastRateLimitLogMs = Date.now();
                console.warn('[QUOTE_BACKOFF]', {
                    dex,
                    pair,
                    fee,
                    reason: 'rpc_rate_limited',
                    backoffMs: 10000,
                });
            }
            return;
        }
        console.log('[QUOTE_FAIL]', {
            dex,
            pair,
            fee,
            reason: dex === 'UNISWAP_V3' ? 'v3_quote_call_failed' : 'v2_getAmountsOut_failed',
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
