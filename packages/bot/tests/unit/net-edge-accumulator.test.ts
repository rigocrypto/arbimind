import { describe, it, expect } from 'vitest';
import { NetEdgeAccumulator } from '../../src/solana/NetEdgeAccumulator';

describe('NetEdgeAccumulator', () => {
  describe('averages', () => {
    it('computes correct averages after multiple trades', () => {
      const acc = new NetEdgeAccumulator({ windowSize: 10, configuredMinTradeUsd: 20 });
      acc.record({ grossUsd: 1.00, executionFeeUsd: 0.10, slippageCostUsd: 0.05, netEdgeUsd: 0.85 });
      acc.record({ grossUsd: 2.00, executionFeeUsd: 0.20, slippageCostUsd: 0.10, netEdgeUsd: 1.70 });
      const report = acc.getReport();
      expect(report.avgGrossUsd).toBeCloseTo(1.50, 2);
      expect(report.avgExecutionFeeUsd).toBeCloseTo(0.15, 2);
      expect(report.avgSlippageCostUsd).toBeCloseTo(0.075, 2);
      expect(report.avgNetEdgeUsd).toBeCloseTo(1.275, 2);
      expect(report.tradeCount).toBe(2);
    });

    it('respects window size — drops old entries', () => {
      const acc = new NetEdgeAccumulator({ windowSize: 3, configuredMinTradeUsd: 10 });
      acc.record({ grossUsd: 1.0, executionFeeUsd: 0.1, slippageCostUsd: 0, netEdgeUsd: 0.9 });
      acc.record({ grossUsd: 2.0, executionFeeUsd: 0.2, slippageCostUsd: 0, netEdgeUsd: 1.8 });
      acc.record({ grossUsd: 3.0, executionFeeUsd: 0.3, slippageCostUsd: 0, netEdgeUsd: 2.7 });
      // Window full — next record drops the first
      acc.record({ grossUsd: 6.0, executionFeeUsd: 0.6, slippageCostUsd: 0, netEdgeUsd: 5.4 });
      const report = acc.getReport();
      expect(report.tradeCount).toBe(3);
      // Should average: (2+3+6)/3 = 3.667
      expect(report.avgGrossUsd).toBeCloseTo(3.667, 2);
    });
  });

  describe('fee drag ratio', () => {
    it('computes fee drag as avgFee / avgGross', () => {
      const acc = new NetEdgeAccumulator({ windowSize: 10, configuredMinTradeUsd: 10 });
      acc.record({ grossUsd: 1.0, executionFeeUsd: 0.3, slippageCostUsd: 0.1, netEdgeUsd: 0.6 });
      acc.record({ grossUsd: 1.0, executionFeeUsd: 0.3, slippageCostUsd: 0.1, netEdgeUsd: 0.6 });
      const report = acc.getReport();
      // feeDragRatio = avgFee / avgGross = 0.3 / 1.0 = 0.3
      expect(report.feeDragRatio).toBeCloseTo(0.3, 2);
    });
  });

  describe('sticky trade-size floor', () => {
    it('returns configuredMinTradeUsd when no trades recorded', () => {
      const acc = new NetEdgeAccumulator({ windowSize: 10, configuredMinTradeUsd: 20 });
      expect(acc.getStickyMinTradeUsd()).toBe(20);
    });

    it('computes floor from break-even notional × multiplier', () => {
      const acc = new NetEdgeAccumulator({
        windowSize: 10,
        configuredMinTradeUsd: 10,
        stickyFloorMultiplier: 1.5,
      });
      // Trade with 50% fee drag → break-even notional = avgFee+avgSlippage / netEdgeRatio
      // grossUsd=1, fee=0.5, slippage=0, net=0.5
      // netEdgeRatio = 0.5/1.0 = 0.5
      // avgTotalCost = 0.5, breakEvenNotional = 0.5 / 0.5 = 1.0
      // stickyFloor = max(10, 1.0 * 1.5) = 10
      acc.record({ grossUsd: 1.0, executionFeeUsd: 0.5, slippageCostUsd: 0, netEdgeUsd: 0.5 });
      expect(acc.getStickyMinTradeUsd()).toBe(10);
    });

    it('floor only moves upward, never down', () => {
      const acc = new NetEdgeAccumulator({
        windowSize: 20,
        configuredMinTradeUsd: 5,
        stickyFloorMultiplier: 1.5,
      });
      // Need at least 5 records for updateStickyFloor to activate
      // High fee drag trades → should push floor above configuredMin
      for (let i = 0; i < 5; i++) {
        acc.record({ grossUsd: 100, executionFeeUsd: 90, slippageCostUsd: 5, netEdgeUsd: 5 });
      }
      const floor1 = acc.getStickyMinTradeUsd();
      expect(floor1).toBeGreaterThan(5);

      // Add low-cost trades — floor should NOT decrease
      for (let i = 0; i < 5; i++) {
        acc.record({ grossUsd: 100, executionFeeUsd: 1, slippageCostUsd: 0, netEdgeUsd: 99 });
      }
      const floor2 = acc.getStickyMinTradeUsd();
      // Sticky: should NOT decrease
      expect(floor2).toBeGreaterThanOrEqual(floor1);
    });
  });

  describe('empty accumulator', () => {
    it('returns zero-valued report', () => {
      const acc = new NetEdgeAccumulator({ windowSize: 10 });
      const report = acc.getReport();
      expect(report.tradeCount).toBe(0);
      expect(report.avgGrossUsd).toBe(0);
      expect(report.avgNetEdgeUsd).toBe(0);
      expect(report.feeDragRatio).toBe(0);
    });
  });

  describe('min and max tracking', () => {
    it('tracks min and max net edge', () => {
      const acc = new NetEdgeAccumulator({ windowSize: 10 });
      acc.record({ grossUsd: 2.0, executionFeeUsd: 0.1, slippageCostUsd: 0, netEdgeUsd: 1.9 });
      acc.record({ grossUsd: 1.0, executionFeeUsd: 0.1, slippageCostUsd: 0, netEdgeUsd: 0.9 });
      acc.record({ grossUsd: 3.0, executionFeeUsd: 0.1, slippageCostUsd: 0, netEdgeUsd: 2.9 });
      const report = acc.getReport();
      expect(report.observedMinNetEdgeUsd).toBeCloseTo(0.9, 2);
      expect(report.observedMaxNetEdgeUsd).toBeCloseTo(2.9, 2);
    });
  });
});
