import { describe, it, expect } from 'vitest';
import { PriorityFeeEstimator, DEFAULT_PRIORITY_FEE_CONFIG } from '../../src/solana/PriorityFeeEstimator';

describe('PriorityFeeEstimator', () => {
  describe('static fallback', () => {
    it('returns static default when disabled', async () => {
      const estimator = new PriorityFeeEstimator({ enabled: false });
      // Pass a mock connection — won't be used when disabled
      const result = await estimator.estimate(null as never);
      expect(result.source).toBe('static-fallback');
      expect(result.maxLamports).toBe(DEFAULT_PRIORITY_FEE_CONFIG.staticDefaultLamports);
    });

    it('returns static default on RPC failure', async () => {
      const estimator = new PriorityFeeEstimator({ enabled: true });
      const mockConnection = {
        getRecentPrioritizationFees: () => Promise.reject(new Error('RPC down')),
      };
      const result = await estimator.estimate(mockConnection as never);
      expect(result.source).toBe('static-fallback');
      expect(result.maxLamports).toBe(DEFAULT_PRIORITY_FEE_CONFIG.staticDefaultLamports);
    });
  });

  describe('dynamic estimation', () => {
    it('returns 75th percentile of non-zero fees', async () => {
      const estimator = new PriorityFeeEstimator({
        enabled: true,
        percentile: 75,
        floorLamports: 1_000,
        capLamports: 10_000_000,
      });
      // Simulate 20 slots with various fees
      const fees = Array.from({ length: 20 }, (_, i) => ({
        slot: i,
        prioritizationFee: (i + 1) * 1000, // 1000, 2000, ..., 20000
      }));
      const mockConnection = {
        getRecentPrioritizationFees: () => Promise.resolve(fees),
      };
      const result = await estimator.estimate(mockConnection as never);
      expect(result.source).toBe('dynamic_global');
      expect(result.sampleCount).toBe(20);
      // 75th percentile of [1000..20000]: index = floor(0.75 * 20) = 15 → 16000
      expect(result.maxLamports).toBe(16_000);
      expect(result.rawPercentileValue).toBe(16_000);
    });

    it('uses floor when all fees are zero', async () => {
      const estimator = new PriorityFeeEstimator({
        enabled: true,
        floorLamports: 5_000,
      });
      const fees = Array.from({ length: 10 }, (_, i) => ({
        slot: i,
        prioritizationFee: 0,
      }));
      const mockConnection = {
        getRecentPrioritizationFees: () => Promise.resolve(fees),
      };
      const result = await estimator.estimate(mockConnection as never);
      expect(result.source).toBe('dynamic_global');
      expect(result.maxLamports).toBe(5_000);
    });

    it('clamps to cap when fees are very high', async () => {
      const estimator = new PriorityFeeEstimator({
        enabled: true,
        capLamports: 2_000_000,
      });
      const fees = Array.from({ length: 10 }, (_, i) => ({
        slot: i,
        prioritizationFee: 50_000_000, // way above cap
      }));
      const mockConnection = {
        getRecentPrioritizationFees: () => Promise.resolve(fees),
      };
      const result = await estimator.estimate(mockConnection as never);
      expect(result.maxLamports).toBe(2_000_000);
    });

    it('clamps to floor when fees are very low', async () => {
      const estimator = new PriorityFeeEstimator({
        enabled: true,
        floorLamports: 10_000,
      });
      const fees = Array.from({ length: 10 }, (_, i) => ({
        slot: i,
        prioritizationFee: 1, // very low
      }));
      const mockConnection = {
        getRecentPrioritizationFees: () => Promise.resolve(fees),
      };
      const result = await estimator.estimate(mockConnection as never);
      expect(result.maxLamports).toBe(10_000);
    });
  });

  describe('caching', () => {
    it('returns cached result within TTL', async () => {
      const estimator = new PriorityFeeEstimator({
        enabled: true,
        cacheTtlMs: 60_000, // 60s so it won't expire
      });
      let callCount = 0;
      const mockConnection = {
        getRecentPrioritizationFees: () => {
          callCount++;
          return Promise.resolve([
            { slot: 0, prioritizationFee: 50_000 },
          ]);
        },
      };
      const result1 = await estimator.estimate(mockConnection as never);
      expect(result1.source).toBe('dynamic_global');
      expect(callCount).toBe(1);

      const result2 = await estimator.estimate(mockConnection as never);
      expect(result2.source).toBe('cached');
      expect(callCount).toBe(1); // not called again
      expect(result2.maxLamports).toBe(result1.maxLamports);
    });
  });

  describe('priority level derivation', () => {
    it('assigns correct priority levels', async () => {
      const estimator = new PriorityFeeEstimator({
        enabled: true,
        floorLamports: 0,
        capLamports: 100_000,
        cacheTtlMs: 0, // no caching
      });

      // Low: < 25% of range
      const mockLow = {
        getRecentPrioritizationFees: () => Promise.resolve([
          { slot: 0, prioritizationFee: 10_000 },
        ]),
      };
      const low = await estimator.estimate(mockLow as never);
      expect(low.priorityLevel).toBe('low');

      // High: 50-75% of range
      const mockHigh = {
        getRecentPrioritizationFees: () => Promise.resolve([
          { slot: 0, prioritizationFee: 60_000 },
        ]),
      };
      const high = await estimator.estimate(mockHigh as never);
      expect(high.priorityLevel).toBe('high');
    });
  });

  describe('getConfig', () => {
    it('returns the merged config', () => {
      const estimator = new PriorityFeeEstimator({ percentile: 90 });
      const cfg = estimator.getConfig();
      expect(cfg.percentile).toBe(90);
      expect(cfg.enabled).toBe(true); // default
    });
  });
});
