import { describe, it, expect, vi } from 'vitest';
import { ArbitrageBot } from '../../src/services/ArbitrageBot';
import type { PriceQuote, TransactionResult } from '../../src/types';
import { ethers } from 'ethers';

class MockPriceService {
  async getQuote(tokenIn: string, tokenOut: string, amountIn: string, dex: string): Promise<PriceQuote | null> {
    if (dex === 'UNISWAP_V2' || dex === 'SUSHISWAP') {
      return {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut: ethers.parseUnits('2000', 6).toString(), // 2000 USDC.e (6 decimals)
        dex,
        fee: 0.003,
        timestamp: Date.now()
      };
    }

    if (dex === 'UNISWAP_V3') {
      return {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut: ethers.parseUnits('2040', 6).toString(), // 2040 USDC.e — 2% edge
        dex,
        fee: 0.003,
        timestamp: Date.now()
      };
    }

    return null;
  }
}

describe('ArbitrageBot integration', () => {
  it('scan → detect → execute full cycle', async () => {
    const executeArbitrage = vi.fn().mockResolvedValue({
      hash: '0xmock',
      success: true,
      gasUsed: '21000',
      gasPrice: '2',
      profit: ethers.parseEther('0.02').toString(),
      timestamp: Date.now()
    } as TransactionResult);

    const bot = new ArbitrageBot({
      priceService: new MockPriceService() as any,
      executionService: { executeArbitrage } as any,
      tokenPairs: [{ tokenA: 'WETH', tokenB: 'USDC.e' }],
      config: {
        minProfitEth: 0.001,
        maxGasGwei: 200,
        swapAmountEth: 1,
        maxTradeSizeEth: 10,
        maxGasUsd: 100,
        minProfitUsd: 0,
        arbExecutorAddress: '0x0000000000000000000000000000000000000001',
        treasuryAddress: '0x0000000000000000000000000000000000000002',
        privateKey: '0x' + '11'.repeat(32)
      }
    });

    const result = await bot.runCycle();

    expect(result.opportunitiesFound).toBeGreaterThan(0);
    expect(result.executed).toBeGreaterThan(0);
    expect(executeArbitrage).toHaveBeenCalled();
  });
});
