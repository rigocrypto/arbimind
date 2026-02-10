import { beforeAll, afterAll, afterEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
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

const server = setupServer(...handlers);

describe('Bot AI HTTP E2E', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it('scores opportunities via AI endpoint', async () => {
    const executeArbitrage = async () => ({
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
        privateKey: '0x' + '11'.repeat(32),
        aiPredictUrl: 'http://localhost:8001/api/ai/predict-arb',
        aiMinSuccessProb: 0.7,
        aiMinExpectedProfitPct: 0.5
      }
    });

    const result = await bot.runCycle();

    expect(result.scoredOpps).toBeGreaterThan(0);
    expect(result.executed).toBeGreaterThan(0);
  });
});
