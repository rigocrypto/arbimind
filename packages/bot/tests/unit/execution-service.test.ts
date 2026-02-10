import { describe, it, expect, vi } from 'vitest';
import { ExecutionService } from '../../src/services/ExecutionService';
import type { ArbitrageOpportunity } from '../../src/types';
import { ethers } from 'ethers';

describe('ExecutionService', () => {
  const opportunity: ArbitrageOpportunity = {
    tokenA: '0x0000000000000000000000000000000000000001',
    tokenB: '0x0000000000000000000000000000000000000002',
    dex1: 'UNISWAP_V2',
    dex2: 'UNISWAP_V3',
    amountIn: '1000000000000000000',
    amountOut1: '1010000000000000000',
    amountOut2: '1020000000000000000',
    profit: '10000000000000000',
    profitPercent: 1,
    gasEstimate: '21000',
    netProfit: '8000000000000000',
    route: 'UNISWAP_V2 -> UNISWAP_V3',
    timestamp: Date.now()
  };

  it('executes arbitrage when transaction succeeds', async () => {
    const provider = {
      estimateGas: vi.fn().mockResolvedValue(21000n),
      getFeeData: vi.fn().mockResolvedValue({
        maxFeePerGas: 2n,
        maxPriorityFeePerGas: 1n
      })
    };

    const wallet = {
      provider,
      sendTransaction: vi.fn().mockResolvedValue({
        hash: '0xmockhash',
        wait: vi.fn().mockResolvedValue({
          status: 1,
          gasUsed: 21000n,
          effectiveGasPrice: 2n
        })
      })
    } as unknown as ethers.Wallet;

    const service = new ExecutionService(wallet, '0x0000000000000000000000000000000000000003');
    (service as any).buildArbitrageTransaction = vi.fn().mockResolvedValue({
      to: '0x0000000000000000000000000000000000000003',
      data: '0xdeadbeef',
      value: 0
    });

    const result = await service.executeArbitrage(opportunity);

    expect(result.success).toBe(true);
    expect(result.hash).toBe('0xmockhash');
    expect(wallet.sendTransaction).toHaveBeenCalled();
  });

  it('returns error on simulation failure', async () => {
    const provider = {
      estimateGas: vi.fn()
    };

    const wallet = {
      provider
    } as unknown as ethers.Wallet;

    const service = new ExecutionService(wallet, '0x0000000000000000000000000000000000000003');
    (service as any).buildArbitrageTransaction = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await service.simulateArbitrage(opportunity);

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
});
