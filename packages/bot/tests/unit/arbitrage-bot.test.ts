import { describe, it, expect, vi } from 'vitest';
import { ArbitrageBot } from '../../src/services/ArbitrageBot';
import type { PriceQuote, TransactionResult } from '../../src/types';
import { ethers } from 'ethers';

class MockPriceService {
  async getQuote(tokenIn: string, tokenOut: string, amountIn: string, dex: string): Promise<PriceQuote | null> {
    if (dex === 'UNISWAP_V2') {
      return {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut: ethers.parseEther('1.0').toString(),
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
        amountOut: ethers.parseEther('1.02').toString(),
        dex,
        fee: 0.003,
        timestamp: Date.now()
      };
    }

    return null;
  }
}

describe('ArbitrageBot (DI)', () => {
  it('runs a single cycle using injected services', async () => {
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
      tokenPairs: [{ tokenA: 'WETH', tokenB: 'USDC' }],
      config: {
        minProfitEth: 0.001,
        maxGasGwei: 200,
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
