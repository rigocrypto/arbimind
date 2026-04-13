import { describe, it, expect } from 'vitest';

/**
 * Test the execution gate formula logic independently.
 * Formula: netExpectedUsd = grossUsd - feeUsd - slippageUsd - riskBufferUsd
 * Gate passes iff netExpectedUsd >= minNetProfitUsd
 *   AND feeUsd < grossUsd
 *   AND slippageUsd < grossUsd
 */

interface GateConfig {
  minNetProfitUsd: number;
  riskBufferUsd: number;
}

function evaluateGate(
  expectedGrossUsd: number,
  estimatedExecutionFeeUsd: number,
  estimatedSlippageCostUsd: number,
  config: GateConfig,
): { passed: boolean; netExpectedUsd: number; rejectReason: string | null } {
  const netExpectedUsd =
    expectedGrossUsd -
    estimatedExecutionFeeUsd -
    estimatedSlippageCostUsd -
    config.riskBufferUsd;

  if (estimatedExecutionFeeUsd >= expectedGrossUsd) {
    return { passed: false, netExpectedUsd, rejectReason: 'fee_exceeds_gross' };
  }
  if (estimatedSlippageCostUsd >= expectedGrossUsd) {
    return { passed: false, netExpectedUsd, rejectReason: 'slippage_exceeds_gross' };
  }
  const GATE_PRECISION = 1e-9;
  if (netExpectedUsd < config.minNetProfitUsd - GATE_PRECISION) {
    return { passed: false, netExpectedUsd, rejectReason: 'net_below_floor' };
  }
  return { passed: true, netExpectedUsd, rejectReason: null };
}

describe('ExecutionGate formula', () => {
  const defaultConfig: GateConfig = { minNetProfitUsd: 0.10, riskBufferUsd: 0.05 };

  it('passes when net exceeds floor', () => {
    // gross=1.00, fee=0.10, slippage=0.05, riskBuffer=0.05 → net=0.80
    const result = evaluateGate(1.00, 0.10, 0.05, defaultConfig);
    expect(result.passed).toBe(true);
    expect(result.netExpectedUsd).toBeCloseTo(0.80, 2);
    expect(result.rejectReason).toBeNull();
  });

  it('rejects when fee exceeds gross', () => {
    const result = evaluateGate(0.10, 0.15, 0.01, defaultConfig);
    expect(result.passed).toBe(false);
    expect(result.rejectReason).toBe('fee_exceeds_gross');
  });

  it('rejects when slippage exceeds gross', () => {
    const result = evaluateGate(0.10, 0.01, 0.15, defaultConfig);
    expect(result.passed).toBe(false);
    expect(result.rejectReason).toBe('slippage_exceeds_gross');
  });

  it('rejects when net below floor', () => {
    // gross=0.40, fee=0.10, slippage=0.05, buffer=0.05 → net=0.20
    // minNetProfit=0.10 → net=0.20 >= 0.10 → passes
    const r1 = evaluateGate(0.40, 0.10, 0.05, defaultConfig);
    expect(r1.passed).toBe(true);
    expect(r1.netExpectedUsd).toBeCloseTo(0.20, 2);

    // gross=0.25, fee=0.10, slippage=0.05, buffer=0.05 → net=0.05 < 0.10 → rejected
    const r2 = evaluateGate(0.25, 0.10, 0.05, defaultConfig);
    expect(r2.passed).toBe(false);
    expect(r2.rejectReason).toBe('net_below_floor');
  });

  it('accounts for risk buffer in net computation', () => {
    // gross=0.50, fee=0.10, slippage=0.05
    // With riskBuffer=0 → net=0.35
    const r1 = evaluateGate(0.50, 0.10, 0.05, { minNetProfitUsd: 0.10, riskBufferUsd: 0 });
    expect(r1.netExpectedUsd).toBeCloseTo(0.35, 2);

    // With riskBuffer=0.20 → net=0.15
    const r2 = evaluateGate(0.50, 0.10, 0.05, { minNetProfitUsd: 0.10, riskBufferUsd: 0.20 });
    expect(r2.netExpectedUsd).toBeCloseTo(0.15, 2);
  });

  it('passes at exact floor boundary with epsilon guard', () => {
    // gross=0.30, fee=0.05, slippage=0.05, buffer=0.05 → net=0.15
    // With floating-point arithmetic this could land at 0.14999...
    // The epsilon guard ensures it still passes
    const result = evaluateGate(0.30, 0.05, 0.05, { minNetProfitUsd: 0.15, riskBufferUsd: 0.05 });
    expect(result.passed).toBe(true);
  });

  it('rejects on zero gross edge with any fee', () => {
    const result = evaluateGate(0, 0.01, 0, defaultConfig);
    expect(result.passed).toBe(false);
    expect(result.rejectReason).toBe('fee_exceeds_gross');
  });

  it('rejects when both gross and fee are zero', () => {
    // 0 >= 0 → fee_exceeds_gross
    const result = evaluateGate(0, 0, 0, { minNetProfitUsd: 0, riskBufferUsd: 0 });
    expect(result.passed).toBe(false);
    expect(result.rejectReason).toBe('fee_exceeds_gross');
  });
});

describe('Rebalance gate formula', () => {
  it('passes when cost bps below threshold', () => {
    const rebalanceAmountUsd = 50;
    const totalCostUsd = 0.10; // fee + slippage
    const costBps = (totalCostUsd / rebalanceAmountUsd) * 10_000;
    expect(costBps).toBe(20); // 20 bps
    expect(costBps <= 100).toBe(true);
  });

  it('rejects when cost bps above threshold', () => {
    const rebalanceAmountUsd = 5;
    const totalCostUsd = 0.10;
    const costBps = (totalCostUsd / rebalanceAmountUsd) * 10_000;
    expect(costBps).toBe(200); // 200 bps
    expect(costBps <= 100).toBe(false);
  });

  it('handles edge case at exact threshold', () => {
    const rebalanceAmountUsd = 100;
    const totalCostUsd = 1.00;
    const costBps = (totalCostUsd / rebalanceAmountUsd) * 10_000;
    expect(costBps).toBe(100); // exactly 100 bps
    expect(costBps <= 100).toBe(true); // passes at threshold
  });
});
