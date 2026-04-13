import { describe, it, expect } from 'vitest';
import {
  resolveSpeedTierPolicy,
  parseSpeedTier,
  getTierDefaults,
} from '../../src/solana/SpeedTierPolicy';

describe('SpeedTierPolicy', () => {
  describe('parseSpeedTier', () => {
    it('parses known tiers case-insensitively', () => {
      expect(parseSpeedTier('standard')).toBe('standard');
      expect(parseSpeedTier('PRIORITY')).toBe('priority');
      expect(parseSpeedTier('Ultra')).toBe('ultra');
    });

    it('defaults to priority for unknown values', () => {
      expect(parseSpeedTier('turbo')).toBe('priority');
      expect(parseSpeedTier('')).toBe('priority');
      expect(parseSpeedTier(undefined)).toBe('priority');
    });
  });

  describe('getTierDefaults', () => {
    it('returns correct defaults for standard', () => {
      const d = getTierDefaults('standard');
      expect(d.priorityFeePercentile).toBe(50);
      expect(d.cacheTtlMs).toBe(12_000);
      expect(d.minNetProfitUsd).toBe(0.10);
      expect(d.riskBufferUsd).toBe(0.05);
    });

    it('returns correct defaults for priority', () => {
      const d = getTierDefaults('priority');
      expect(d.priorityFeePercentile).toBe(75);
      expect(d.cacheTtlMs).toBe(6_000);
      expect(d.minNetProfitUsd).toBe(0.08);
      expect(d.riskBufferUsd).toBe(0.03);
    });

    it('returns correct defaults for ultra', () => {
      const d = getTierDefaults('ultra');
      expect(d.priorityFeePercentile).toBe(90);
      expect(d.cacheTtlMs).toBe(3_000);
      expect(d.minNetProfitUsd).toBe(0.06);
      expect(d.riskBufferUsd).toBe(0.02);
    });
  });

  describe('resolveSpeedTierPolicy', () => {
    it('returns tier defaults when no overrides', () => {
      const policy = resolveSpeedTierPolicy({ tier: 'priority', overrides: {} });
      const expected = getTierDefaults('priority');
      expect(policy).toEqual(expected);
    });

    it('applies overrides on top of tier defaults', () => {
      const policy = resolveSpeedTierPolicy({
        tier: 'standard',
        overrides: { priorityFeePercentile: 60, minNetProfitUsd: 0.20 },
      });
      expect(policy.priorityFeePercentile).toBe(60);
      expect(policy.minNetProfitUsd).toBe(0.20);
      // Non-overridden values stay at tier defaults
      expect(policy.cacheTtlMs).toBe(getTierDefaults('standard').cacheTtlMs);
      expect(policy.riskBufferUsd).toBe(getTierDefaults('standard').riskBufferUsd);
    });

    it('ignores undefined override values', () => {
      const policy = resolveSpeedTierPolicy({
        tier: 'ultra',
        overrides: { priorityFeePercentile: undefined as unknown as number },
      });
      expect(policy.priorityFeePercentile).toBe(getTierDefaults('ultra').priorityFeePercentile);
    });
  });
});
