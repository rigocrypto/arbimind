/**
 * Price service – fetches DEX quotes for arbitrage.
 * Supports Uniswap V3 (Quoter V2) + any V2-compatible router (Uniswap V2, SushiSwap).
 */
import { Contract, getAddress, type Provider } from 'ethers';
import type { PriceQuote } from '../types';
import { getTokenAddress, getTokenConfig } from '../config/tokens';
import { DEX_CONFIG } from '../config/dexes';
import { retryQuote } from '../utils/retryQuote.js';

const QUOTER_V2_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const QUOTER_V1_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
];

const V2_ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] path) external view returns (uint256[] amounts)',
];

const V3_FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

export class PriceService {
  private provider: Provider;
  private quoterV3: Contract | null = null;
  private quoterV3v1: Contract | null = null;
  private v2Routers: Map<string, Contract> = new Map();
  private rateLimitedUntilMs: number = 0;
  private lastRateLimitLogMs: number = 0;
  private readonly v3Enabled: boolean;
  private v3QuoterVersion: 'v2' | 'v1' | 'unknown' = 'unknown';
  private readonly consecutiveFailures = new Map<string, number>();

  constructor(provider: Provider) {
    this.provider = provider;

    // Resolve V3 quoter from DEX_CONFIG
    const v3Config = DEX_CONFIG['UNISWAP_V3'];
    const quoterAddr = v3Config?.quoter?.trim() || '';
    this.v3Enabled = Boolean(v3Config?.enabled && quoterAddr);

    if (this.v3Enabled && quoterAddr) {
      try {
        const checksummed = getAddress(quoterAddr.toLowerCase());
        this.quoterV3 = new Contract(checksummed, QUOTER_V2_ABI, provider);
        this.quoterV3v1 = new Contract(checksummed, QUOTER_V1_ABI, provider);
        void this.detectQuoterVersion(checksummed);
      } catch {
        console.warn('[PRICE_SERVICE_INIT] Invalid V3 quoter address, disabling V3:', quoterAddr);
      }
    }

    // Build V2 router contracts for all enabled V2 DEXes
    for (const [dexName, dexCfg] of Object.entries(DEX_CONFIG)) {
      if (!dexCfg.enabled || dexCfg.version !== 'v2' || !dexCfg.router) continue;
      try {
        const checksummed = getAddress(dexCfg.router.toLowerCase());
        this.v2Routers.set(dexName, new Contract(checksummed, V2_ROUTER_ABI, provider));
      } catch {
        console.warn(`[PRICE_SERVICE_INIT] Invalid V2 router address for ${dexName}:`, dexCfg.router);
      }
    }

    // Log once at startup so we can verify exactly which addresses are being used.
    console.log('[PRICE_SERVICE_INIT]', {
      v3Quoter: quoterAddr || 'DISABLED',
      v3Enabled: this.v3Enabled,
      v2Routers: Object.fromEntries(
        [...this.v2Routers.entries()].map(([k, c]) => [k, c.target])
      ),
    });
  }

  async getQuote(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountIn: string,
    dex: string
  ): Promise<PriceQuote | null> {
    const nowMs = Date.now();
    if (nowMs < this.rateLimitedUntilMs) {
      return null;
    }

    let tokenInAddr: string;
    let tokenOutAddr: string;
    let decimalsIn: number;
    let decimalsOut: number;
    try {
      tokenInAddr = getTokenAddress(tokenInSymbol);
      tokenOutAddr = getTokenAddress(tokenOutSymbol);
      decimalsIn = getTokenConfig(tokenInSymbol).decimals;
      decimalsOut = getTokenConfig(tokenOutSymbol).decimals;
    } catch (error) {
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
      const quote = await this.getBestV3Quote(
        tokenInAddr,
        tokenOutAddr,
        amountInBig,
        decimalsIn,
        decimalsOut
      );
      if (!quote) return null;
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
      const quote = await this.getV2Quote(
        v2Router,
        dex,
        tokenInAddr,
        tokenOutAddr,
        amountInBig,
        decimalsIn,
        decimalsOut
      );
      if (!quote) return null;
      return {
        tokenIn: tokenInSymbol,
        tokenOut: tokenOutSymbol,
        amountIn,
        amountOut: quote.amountOut.toString(),
        dex,
        fee: DEX_CONFIG[dex]?.fee ? DEX_CONFIG[dex].fee * 10000 : 3000,
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

  private async getBestV3Quote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    _decimalsIn: number,
    _decimalsOut: number
  ): Promise<{ amountOut: bigint; fee: number } | null> {
    if (!this.quoterV3 && !this.quoterV3v1) return null;
    let best: { amountOut: bigint; fee: number } | null = null;
    const errors: string[] = [];

    for (const fee of V3_FEE_TIERS) {
      try {
        let amountOut: bigint | null = null;

        // Try QuoterV2 struct ABI first (unless we already know it's V1)
        if (this.v3QuoterVersion !== 'v1' && this.quoterV3) {
          try {
            const result = await this.quoterV3.quoteExactInputSingle.staticCall({
              tokenIn,
              tokenOut,
              amountIn,
              fee,
              sqrtPriceLimitX96: 0n,
            });
            amountOut = typeof result === 'bigint' ? result : (result as unknown[])[0] as bigint;
            if (this.v3QuoterVersion === 'unknown') {
              this.v3QuoterVersion = 'v2';
              console.log('[V3_QUOTER_DETECTED] QuoterV2 ABI works');
            }
          } catch {
            // V2 ABI failed — will try V1 below
          }
        }

        // Fallback to QuoterV1 individual-param ABI
        if (amountOut == null && this.quoterV3v1) {
          try {
            const result = await this.quoterV3v1.quoteExactInputSingle.staticCall(
              tokenIn,
              tokenOut,
              fee,
              amountIn,
              0n,
            );
            amountOut = typeof result === 'bigint' ? result : (result as unknown[])[0] as bigint;
            if (this.v3QuoterVersion === 'unknown') {
              this.v3QuoterVersion = 'v1';
              console.log('[V3_QUOTER_DETECTED] QuoterV1 ABI works (individual params)');
            }
          } catch (v1Error) {
            errors.push(`fee=${fee}: ${v1Error instanceof Error ? v1Error.message : String(v1Error)}`);
          }
        }

        if (amountOut != null && amountOut > 0n && (!best || amountOut > best.amountOut)) {
          best = { amountOut, fee };
        }
      } catch (error) {
        this.handleRpcError('UNISWAP_V3', `${tokenIn}/${tokenOut}`, error, fee);
      }
    }

    if (!best && errors.length > 0) {
      console.log('[V3_QUOTE_ALL_TIERS_FAILED]', {
        pair: `${tokenIn}/${tokenOut}`,
        quoterVersion: this.v3QuoterVersion,
        errors: errors.slice(0, 3),
      });
    }

    return best;
  }

  private async getV2Quote(
    router: Contract,
    dexName: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    _decimalsIn: number,
    _decimalsOut: number
  ): Promise<{ amountOut: bigint } | null> {
    const pairKey = `${dexName}:${tokenIn}/${tokenOut}`;
    const label = `${dexName}/${tokenIn.slice(0, 10)}/${tokenOut.slice(0, 10)}`;

    // First check if this is a rate-limited period before calling out.
    const nowMs = Date.now();
    if (nowMs < this.rateLimitedUntilMs) return null;

    const amounts = await retryQuote(
      () => router.getAmountsOut.staticCall(amountIn, [tokenIn, tokenOut]) as Promise<bigint[]>,
      { attempts: 2, delayMs: 350, label },
    );

    if (amounts === null) {
      const failures = (this.consecutiveFailures.get(pairKey) ?? 0) + 1;
      this.consecutiveFailures.set(pairKey, failures);
      if (failures >= 10 && failures % 10 === 0) {
        console.warn('[QUOTE_DEAD_POOL]', {
          dex: dexName,
          pair: pairKey,
          consecutiveFailures: failures,
          hint: 'Pool may be illiquid or the V2 pair may not exist on this network.',
        });
      }
      return null;
    }

    // Reset failure streak on success.
    this.consecutiveFailures.set(pairKey, 0);

    const amountOut = Array.isArray(amounts) ? amounts[1] : (amounts as unknown as Record<number, bigint>)[1];
    if (amountOut && amountOut > 0n) return { amountOut };
    return null;
  }

  private handleRpcError(dex: string, pair: string, error: unknown, fee?: number): void {
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

  private async detectQuoterVersion(quoterAddress: string): Promise<void> {
    try {
      const code = await this.provider.getCode(quoterAddress);
      const hasCode = code !== '0x';
      console.log('[V3_QUOTER_CHECK]', {
        address: quoterAddress,
        hasCode,
        codeLength: code.length,
      });
      if (!hasCode) {
        console.warn('[V3_QUOTER_CHECK] No contract at quoter address — V3 quotes will fail');
      }
    } catch (error) {
      console.log('[V3_QUOTER_CHECK_FAIL]', {
        address: quoterAddress,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
