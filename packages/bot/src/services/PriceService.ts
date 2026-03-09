/**
 * Price service – fetches DEX quotes for arbitrage.
 * Uniswap V3 (Quoter V2) + Uniswap V2 on Ethereum Sepolia.
 */
import { Contract, getAddress, type Provider } from 'ethers';
import type { PriceQuote } from '../types';
import { getTokenAddress, getTokenConfig } from '../config/tokens';

const QUOTER_V2_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const V2_ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] path) external view returns (uint256[] amounts)',
];

const V3_FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

const MAINNET_V3_QUOTER = '0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6';
const MAINNET_V2_ROUTER = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';

function normalizeAddress(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

function isEthereumSepoliaProfile(): boolean {
  const network = (process.env['NETWORK'] || '').trim().toLowerCase();
  const evmChain = (process.env['EVM_CHAIN'] || '').trim().toLowerCase();
  return network === 'testnet' && evmChain === 'ethereum';
}

function resolveAddress(primaryEnv: string, fallbackEnv: string, label: string): string {
  const raw = (process.env[primaryEnv] || process.env[fallbackEnv] || '').trim();
  if (!raw) return '';
  try {
    // Lowercase first so non-checksummed mixed-case env values are accepted and canonicalized.
    return getAddress(raw.toLowerCase());
  } catch {
    throw new Error(`Invalid address for ${label}: ${raw}`);
  }
}

function isSepoliaQuoterConfigured(): boolean {
  return Boolean(resolveAddress('SEPOLIA_UNISWAP_V3_QUOTER', 'UNISWAP_V3_QUOTER', 'SEPOLIA_UNISWAP_V3_QUOTER'));
}

function isSepoliaV2Configured(): boolean {
  return Boolean(resolveAddress('SEPOLIA_UNISWAP_V2_ROUTER', 'UNISWAP_V2_ROUTER', 'SEPOLIA_UNISWAP_V2_ROUTER'));
}

export class PriceService {
  private provider: Provider;
  private quoterV3: Contract | null = null;
  private routerV2: Contract | null = null;
  private rateLimitedUntilMs: number = 0;
  private lastRateLimitLogMs: number = 0;

  constructor(provider: Provider) {
    this.provider = provider;
    const quoterAddr = resolveAddress('SEPOLIA_UNISWAP_V3_QUOTER', 'UNISWAP_V3_QUOTER', 'SEPOLIA_UNISWAP_V3_QUOTER');
    const routerAddr = resolveAddress('SEPOLIA_UNISWAP_V2_ROUTER', 'UNISWAP_V2_ROUTER', 'SEPOLIA_UNISWAP_V2_ROUTER');
    const isSepolia = isEthereumSepoliaProfile();

    if (isSepolia && (!quoterAddr || !routerAddr)) {
      throw new Error('Missing Sepolia DEX configuration: set SEPOLIA_UNISWAP_V3_QUOTER and SEPOLIA_UNISWAP_V2_ROUTER');
    }

    if (isSepolia && normalizeAddress(quoterAddr) === MAINNET_V3_QUOTER) {
      throw new Error('Invalid Sepolia config: SEPOLIA_UNISWAP_V3_QUOTER points to mainnet quoter 0xb273...');
    }

    if (isSepolia && normalizeAddress(routerAddr) === MAINNET_V2_ROUTER) {
      throw new Error('Invalid Sepolia config: SEPOLIA_UNISWAP_V2_ROUTER points to mainnet router 0x7a25...');
    }

    if (quoterAddr) {
      this.quoterV3 = new Contract(quoterAddr, QUOTER_V2_ABI, provider);
    }
    if (routerAddr) {
      this.routerV2 = new Contract(routerAddr, V2_ROUTER_ABI, provider);
    }

    // Log once at startup so we can verify exactly which addresses are being used.
    console.log('[PRICE_SERVICE_INIT]', {
      v3Quoter: quoterAddr || 'MISSING',
      v2Router: routerAddr || 'MISSING',
      mode: isSepolia ? 'sepolia' : 'generic',
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

    if (!isSepoliaQuoterConfigured() && !isSepoliaV2Configured()) {
      console.log('[QUOTE_FAIL]', {
        dex,
        pair: `${tokenInSymbol}/${tokenOutSymbol}`,
        reason: 'missing_sepolia_quoter_and_v2_router',
      });
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

    if (dex === 'UNISWAP_V3' && this.quoterV3) {
      const quote = await this.getBestV3Quote(
        tokenInAddr,
        tokenOutAddr,
        amountInBig,
        decimalsIn,
        decimalsOut
      );
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

    if (dex === 'UNISWAP_V2' && this.routerV2) {
      const quote = await this.getV2Quote(
        tokenInAddr,
        tokenOutAddr,
        amountInBig,
        decimalsIn,
        decimalsOut
      );
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

  private async getBestV3Quote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    _decimalsIn: number,
    _decimalsOut: number
  ): Promise<{ amountOut: bigint; fee: number } | null> {
    if (!this.quoterV3) return null;
    let best: { amountOut: bigint; fee: number } | null = null;

    for (const fee of V3_FEE_TIERS) {
      try {
        const result = await this.quoterV3.quoteExactInputSingle.staticCall({
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        });
        const amountOut = typeof result === 'bigint' ? result : (result as unknown[])[0] as bigint;
        if (amountOut > 0n && (!best || amountOut > best.amountOut)) {
          best = { amountOut, fee };
        }
      } catch (error) {
        this.handleRpcError('UNISWAP_V3', `${tokenIn}/${tokenOut}`, error, fee);
      }
    }
    return best;
  }

  private async getV2Quote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    _decimalsIn: number,
    _decimalsOut: number
  ): Promise<{ amountOut: bigint } | null> {
    if (!this.routerV2) return null;
    try {
      const amounts = await this.routerV2.getAmountsOut.staticCall(amountIn, [tokenIn, tokenOut]);
      const amountOut = Array.isArray(amounts) ? (amounts as bigint[])[1] : amounts[1];
      if (amountOut && amountOut > 0n) return { amountOut };
    } catch (error) {
      this.handleRpcError('UNISWAP_V2', `${tokenIn}/${tokenOut}`, error);
    }
    return null;
  }

  private handleRpcError(dex: 'UNISWAP_V2' | 'UNISWAP_V3', pair: string, error: unknown, fee?: number): void {
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
      reason: dex === 'UNISWAP_V3' ? 'v3_quote_call_failed' : 'v2_getAmountsOut_failed',
      error: message,
    });
  }
}
