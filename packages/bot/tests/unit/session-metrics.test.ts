import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionMetrics } from '../../src/solana/SessionMetrics';

describe('SessionMetrics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('funnel counting', () => {
    it('starts with all counters at zero', () => {
      const m = new SessionMetrics();
      const snap = m.getFunnelSnapshot();
      expect(snap.discovered).toBe(0);
      expect(snap.gateEvaluated).toBe(0);
      expect(snap.gatePassed).toBe(0);
      expect(snap.gateRejected).toBe(0);
      expect(snap.swapsBuilt).toBe(0);
      expect(snap.swapBuildFailed).toBe(0);
      expect(snap.submitted).toBe(0);
      expect(snap.confirmed).toBe(0);
      expect(snap.expired).toBe(0);
      expect(snap.failed).toBe(0);
      expect(snap.rebalanceEvaluated).toBe(0);
      expect(snap.rebalanceRejected).toBe(0);
      expect(snap.rejectReasons).toEqual({});
    });

    it('increments each stage independently', () => {
      const m = new SessionMetrics();
      m.recordDiscovered();
      m.recordDiscovered();
      m.recordGateEvaluated();
      m.recordGatePassed();
      m.recordSwapBuilt();
      m.recordSubmitted();
      m.recordConfirmed();

      const snap = m.getFunnelSnapshot();
      expect(snap.discovered).toBe(2);
      expect(snap.gateEvaluated).toBe(1);
      expect(snap.gatePassed).toBe(1);
      expect(snap.swapsBuilt).toBe(1);
      expect(snap.submitted).toBe(1);
      expect(snap.confirmed).toBe(1);
    });

    it('tracks expired and failed separately', () => {
      const m = new SessionMetrics();
      m.recordExpired();
      m.recordExpired();
      m.recordFailed();

      const snap = m.getFunnelSnapshot();
      expect(snap.expired).toBe(2);
      expect(snap.failed).toBe(1);
    });

    it('tracks rebalance evaluated and rejected', () => {
      const m = new SessionMetrics();
      m.recordRebalanceEvaluated();
      m.recordRebalanceEvaluated();
      m.recordRebalanceRejected();

      const snap = m.getFunnelSnapshot();
      expect(snap.rebalanceEvaluated).toBe(2);
      expect(snap.rebalanceRejected).toBe(1);
    });
  });

  describe('reject reasons', () => {
    it('tracks reason breakdown', () => {
      const m = new SessionMetrics();
      m.recordGateRejected('net_edge_negative');
      m.recordGateRejected('net_edge_negative');
      m.recordGateRejected('low_landing_rate');

      const snap = m.getFunnelSnapshot();
      expect(snap.gateRejected).toBe(3);
      expect(snap.rejectReasons).toEqual({
        net_edge_negative: 2,
        low_landing_rate: 1,
      });
    });

    it('returns a copy of rejectReasons (not a reference)', () => {
      const m = new SessionMetrics();
      m.recordGateRejected('test');
      const snap1 = m.getFunnelSnapshot();
      snap1.rejectReasons['test'] = 99;
      const snap2 = m.getFunnelSnapshot();
      expect(snap2.rejectReasons['test']).toBe(1);
    });
  });

  describe('quote age tracking', () => {
    it('returns null averages with no recordings', () => {
      const m = new SessionMetrics();
      const summary = m.getSummary();
      expect(summary.avgQuoteAgeMs).toBeNull();
      expect(summary.minQuoteAgeMs).toBeNull();
      expect(summary.maxQuoteAgeMs).toBeNull();
    });

    it('computes min/max/avg correctly', () => {
      const m = new SessionMetrics();
      m.recordQuoteAge(100);
      m.recordQuoteAge(200);
      m.recordQuoteAge(300);

      const summary = m.getSummary();
      expect(summary.avgQuoteAgeMs).toBe(200);
      expect(summary.minQuoteAgeMs).toBe(100);
      expect(summary.maxQuoteAgeMs).toBe(300);
    });

    it('ignores negative or non-finite values', () => {
      const m = new SessionMetrics();
      m.recordQuoteAge(-5);
      m.recordQuoteAge(Infinity);
      m.recordQuoteAge(NaN);
      m.recordQuoteAge(150);

      const summary = m.getSummary();
      expect(summary.avgQuoteAgeMs).toBe(150);
      expect(summary.minQuoteAgeMs).toBe(150);
      expect(summary.maxQuoteAgeMs).toBe(150);
    });
  });

  describe('fee normalization', () => {
    it('returns null averages with no recordings', () => {
      const m = new SessionMetrics();
      const summary = m.getSummary();
      expect(summary.avgFeeBpsOfNotional).toBeNull();
      expect(summary.avgNetEdgeBpsOfNotional).toBeNull();
    });

    it('computes fee BPS correctly', () => {
      const m = new SessionMetrics();
      // notional=$100, fee=$0.50 => 50bps, netEdge=$0.30 => 30bps
      m.recordFeeNormalization(100, 0.50, 0.30);

      const summary = m.getSummary();
      expect(summary.avgFeeBpsOfNotional).toBe(50);
      expect(summary.avgNetEdgeBpsOfNotional).toBe(30);
    });

    it('skips zero notional', () => {
      const m = new SessionMetrics();
      m.recordFeeNormalization(0, 0.5, 0.3);

      const summary = m.getSummary();
      expect(summary.avgFeeBpsOfNotional).toBeNull();
    });

    it('averages multiple fee recordings', () => {
      const m = new SessionMetrics();
      // Trade 1: notional $100, fee $1 (100bps), edge $0.50 (50bps)
      m.recordFeeNormalization(100, 1.0, 0.50);
      // Trade 2: notional $200, fee $1 (50bps), edge $1 (50bps)
      m.recordFeeNormalization(200, 1.0, 1.0);

      const summary = m.getSummary();
      // avg fee bps = (100 + 50) / 2 = 75
      expect(summary.avgFeeBpsOfNotional).toBe(75);
      // avg edge bps = (50 + 50) / 2 = 50
      expect(summary.avgNetEdgeBpsOfNotional).toBe(50);
    });
  });

  describe('trade economics', () => {
    it('returns null averages with no recordings', () => {
      const m = new SessionMetrics();
      const summary = m.getSummary();
      expect(summary.avgExpectedGrossUsd).toBeNull();
      expect(summary.avgExecutionFeeUsd).toBeNull();
      expect(summary.avgNetEdgeUsd).toBeNull();
    });

    it('computes averages correctly', () => {
      const m = new SessionMetrics();
      m.recordTradeEconomics(1.0, 0.20, 0.80);
      m.recordTradeEconomics(2.0, 0.40, 1.60);

      const summary = m.getSummary();
      // avg gross = (1.0 + 2.0) / 2 = 1.5
      expect(summary.avgExpectedGrossUsd).toBe(1.5);
      // avg fee = (0.20 + 0.40) / 2 = 0.3
      expect(summary.avgExecutionFeeUsd).toBe(0.3);
      // avg net = (0.80 + 1.60) / 2 = 1.2
      expect(summary.avgNetEdgeUsd).toBe(1.2);
    });
  });

  describe('session summary', () => {
    it('includes session duration', () => {
      const m = new SessionMetrics();
      const summary = m.getSummary();
      expect(summary.sessionDurationSec).toBeGreaterThanOrEqual(0);
    });

    it('includes all funnel fields', () => {
      const m = new SessionMetrics();
      m.recordDiscovered();
      m.recordGateEvaluated();
      m.recordGateRejected('test_reason');

      const summary = m.getSummary();
      expect(summary.discovered).toBe(1);
      expect(summary.gateEvaluated).toBe(1);
      expect(summary.gateRejected).toBe(1);
      expect(summary.rejectReasons).toEqual({ test_reason: 1 });
    });
  });

  describe('periodic summary', () => {
    it('emits summary on emitSummary()', () => {
      const m = new SessionMetrics();
      m.recordDiscovered();
      // emitSummary should not throw
      expect(() => m.emitSummary()).not.toThrow();
    });

    it('starts and stops periodic timer', () => {
      const m = new SessionMetrics({ summaryIntervalMs: 60_000 });
      m.startPeriodicSummary();
      // Starting again is a no-op
      m.startPeriodicSummary();
      m.stopPeriodicSummary();
      // Stopping again is safe
      m.stopPeriodicSummary();
    });
  });
});
