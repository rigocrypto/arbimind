/**
 * Price service – fetches DEX quotes for arbitrage.
 * Uniswap V3 (Quoter V2) + Uniswap V2 on Ethereum Sepolia.
 */
import { Contract, type Provider } from 'ethers';
import type { PriceQuote } from '../types';
import { getTokenAddress, getTokenConfig } from '../config/tokens';

const QUOTER_V2_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const V2_ROUTER_ABI = [
  'function getAmountsOut(uint256 amountIn, address[] path) external view returns (uint256[] amounts)',
];

const V3_FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

function isSepoliaQuoterConfigured(): boolean {
  return Boolean(process.env['SEPOLIA_UNISWAP_V3_QUOTER']?.trim());
}

function isSepoliaV2Configured(): boolean {
  return Boolean(process.env['SEPOLIA_UNISWAP_V2_ROUTER']?.trim());
}

export class PriceService {
  private provider: Provider;
  private quoterV3: Contract | null = null;
  private routerV2: Contract | null = null;

  constructor(provider: Provider) {
    this.provider = provider;
    const quoterAddr = process.env['SEPOLIA_UNISWAP_V3_QUOTER']?.trim();
    const routerAddr = process.env['SEPOLIA_UNISWAP_V2_ROUTER']?.trim();
    if (quoterAddr) {
      this.quoterV3 = new Contract(quoterAddr, QUOTER_V2_ABI, provider);
    }
    if (routerAddr) {
      this.routerV2 = new Contract(routerAddr, V2_ROUTER_ABI, provider);
    }
  }

  async getQuote(
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountIn: string,
    dex: string
  ): Promise<PriceQuote | null> {
    console.log('[PRICE_SERVICE_ENV]', {
      dex,
      hasV3Quoter: Boolean(process.env['SEPOLIA_UNISWAP_V3_QUOTER']?.trim()),
      hasV2Router: Boolean(process.env['SEPOLIA_UNISWAP_V2_ROUTER']?.trim()),
      hasWeth: Boolean(process.env['SEPOLIA_WETH_ADDRESS']?.trim()),
      hasUsdc: Boolean(process.env['SEPOLIA_USDC_ADDRESS']?.trim()),
      hasDai: Boolean(process.env['SEPOLIA_DAI_ADDRESS']?.trim()),
      tokenIn: tokenInSymbol,
      tokenOut: tokenOutSymbol,
    });

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
        console.log('[QUOTE_FAIL]', {
          dex,
          pair: `${tokenInSymbol}/${tokenOutSymbol}`,
          reason: 'v3_no_quote_for_all_fee_tiers',
        });
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
        console.log('[QUOTE_FAIL]', {
          dex,
          pair: `${tokenInSymbol}/${tokenOutSymbol}`,
          reason: 'v2_no_quote_or_pair_missing',
        });
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
        console.log('[QUOTE_FAIL]', {
          dex: 'UNISWAP_V3',
          pair: `${tokenIn}/${tokenOut}`,
          fee,
          reason: 'v3_quote_call_failed',
          error: error instanceof Error ? error.message : String(error),
        });
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
      console.log('[QUOTE_FAIL]', {
        dex: 'UNISWAP_V2',
        pair: `${tokenIn}/${tokenOut}`,
        reason: 'v2_getAmountsOut_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}
