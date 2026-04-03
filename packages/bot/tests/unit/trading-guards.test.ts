import { describe, it, expect, vi } from 'vitest';
import { ArbitrageBot } from '../../src/services/ArbitrageBot';
import type { PriceQuote, TransactionResult } from '../../src/types';
import { ethers } from 'ethers';

/**
 * Mock that returns V2 = 2000 USDC.e, V3 = 2040 USDC.e for a 2% edge.
 */
class MockPriceService {
  async getQuote(tokenIn: string, tokenOut: string, amountIn: string, dex: string): Promise<PriceQuote | null> {
    if (dex === 'UNISWAP_V2' || dex === 'SUSHISWAP') {
      return { tokenIn, tokenOut, amountIn, amountOut: ethers.parseUnits('2000', 6).toString(), dex, fee: 0.003, timestamp: Date.now() };
    }
    if (dex === 'UNISWAP_V3') {
      return { tokenIn, tokenOut, amountIn, amountOut: ethers.parseUnits('2040', 6).toString(), dex, fee: 0.003, timestamp: Date.now() };
    }
    return null;
  }
}

function makeBot(configOverrides: Record<string, unknown> = {}, execMock?: unknown) {
  const executeArbitrage = vi.fn().mockResolvedValue({
    hash: '0xmock', success: true, gasUsed: '21000', gasPrice: '2',
    profit: ethers.parseEther('0.02').toString(), timestamp: Date.now(),
  } as TransactionResult);

  return {
    bot: new ArbitrageBot({
      priceService: new MockPriceService() as any,
      executionService: (execMock ?? { executeArbitrage }) as any,
      alertService: {
        tradeExecuted: vi.fn().mockResolvedValue(undefined),
        tradeFailed: vi.fn().mockResolvedValue(undefined),
        guardBlocked: vi.fn().mockResolvedValue(undefined),
        botStopped: vi.fn().mockResolvedValue(undefined),
        info: vi.fn().mockResolvedValue(undefined),
      } as any,
      tokenPairs: [{ tokenA: 'WETH', tokenB: 'USDC.e' }],
      config: {
        minProfitEth: 0.001,
        maxGasGwei: 200,
        swapAmountEth: 1,
        maxTradeSizeEth: 0.10,
        maxGasUsd: 2.00,
        minProfitUsd: 1.00,
        arbExecutorAddress: '0x0000000000000000000000000000000000000001',
        treasuryAddress: '0x0000000000000000000000000000000000000002',
        privateKey: '0x' + '11'.repeat(32),
        ...configOverrides,
      },
    }),
    executeArbitrage,
  };
}

describe('Trading Guards', () => {
  it('blocks execution when swap amount exceeds MAX_TRADE_SIZE_ETH', async () => {
    // swapAmountEth = 1 ETH but maxTradeSizeEth = 0.10 → should block
    const { bot, executeArbitrage } = makeBot({ swapAmountEth: 1, maxTradeSizeEth: 0.10 });
    const result = await bot.runCycle();

    // Opportunities are found (spread exists) but none executed (guard blocks)
    expect(result.opportunitiesFound).toBeGreaterThan(0);
    expect(result.executed).toBe(0);
    expect(executeArbitrage).not.toHaveBeenCalled();
  });

  it('allows execution when swap amount is within MAX_TRADE_SIZE_ETH', async () => {
    const { bot, executeArbitrage } = makeBot({ swapAmountEth: 1, maxTradeSizeEth: 10, maxGasUsd: 100, minProfitUsd: 0 });
    const result = await bot.runCycle();

    expect(result.opportunitiesFound).toBeGreaterThan(0);
    expect(result.executed).toBeGreaterThan(0);
    expect(executeArbitrage).toHaveBeenCalled();
  });

  it('blocks execution when net profit is below MIN_PROFIT_USD', async () => {
    // Very high MIN_PROFIT_USD that no opportunity can meet
    const { bot, executeArbitrage } = makeBot({ swapAmountEth: 1, maxTradeSizeEth: 10, minProfitUsd: 999999 });
    const result = await bot.runCycle();

    expect(result.executed).toBe(0);
    expect(executeArbitrage).not.toHaveBeenCalled();
  });
});
