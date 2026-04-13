import { describe, it, expect } from 'vitest';
import { LandingTracker } from '../../src/solana/LandingTracker';

describe('LandingTracker', () => {
  describe('landing rate computation', () => {
    it('reports 100% when all confirmed', () => {
      const tracker = new LandingTracker({ windowSize: 10 });
      for (let i = 0; i < 5; i++) tracker.record('confirmed');
      const report = tracker.getReport();
      expect(report.landingRate).toBe(1.0);
      expect(report.windowConfirmed).toBe(5);
      expect(report.windowSubmitted).toBe(5);
    });

    it('reports 0% when none confirmed', () => {
      const tracker = new LandingTracker({ windowSize: 10 });
      for (let i = 0; i < 3; i++) tracker.record('expired');
      for (let i = 0; i < 2; i++) tracker.record('failed');
      const report = tracker.getReport();
      expect(report.landingRate).toBe(0);
      expect(report.windowExpired).toBe(3);
      expect(report.windowFailed).toBe(2);
    });

    it('computes mixed rate correctly', () => {
      const tracker = new LandingTracker({ windowSize: 10 });
      tracker.record('confirmed');
      tracker.record('confirmed');
      tracker.record('confirmed');
      tracker.record('expired');
      tracker.record('failed');
      const report = tracker.getReport();
      expect(report.landingRate).toBe(0.6);
    });

    it('rolls off old entries beyond window', () => {
      const tracker = new LandingTracker({ windowSize: 5 });
      // Fill with 5 failures
      for (let i = 0; i < 5; i++) tracker.record('failed');
      expect(tracker.getReport().landingRate).toBe(0);
      // Now add 5 confirmations — failures should roll off
      for (let i = 0; i < 5; i++) tracker.record('confirmed');
      expect(tracker.getReport().landingRate).toBe(1.0);
      expect(tracker.getReport().windowSubmitted).toBe(5);
    });
  });

  describe('auto-escalation', () => {
    it('escalates when landing rate drops below threshold', () => {
      const tracker = new LandingTracker({
        windowSize: 50,
        warningThreshold: 0.70,
        autoEscalate: true,
        escalatePercentileBoost: 10,
        escalatePercentileCap: 95,
      });
      // Submit 10 with only 5 confirmed (50% < 70%)
      for (let i = 0; i < 5; i++) tracker.record('confirmed');
      for (let i = 0; i < 5; i++) tracker.record('expired');
      expect(tracker.isEscalated()).toBe(true);
      expect(tracker.getPercentileBoost()).toBe(10);
      expect(tracker.getEscalatePercentileCap()).toBe(95);
    });

    it('does not escalate when rate is above threshold', () => {
      const tracker = new LandingTracker({
        windowSize: 50,
        warningThreshold: 0.70,
        autoEscalate: true,
      });
      // 8/10 = 80% > 70%
      for (let i = 0; i < 8; i++) tracker.record('confirmed');
      for (let i = 0; i < 2; i++) tracker.record('expired');
      expect(tracker.isEscalated()).toBe(false);
      expect(tracker.getPercentileBoost()).toBe(0);
    });

    it('does not escalate when autoEscalate is disabled', () => {
      const tracker = new LandingTracker({
        windowSize: 50,
        warningThreshold: 0.70,
        autoEscalate: false,
      });
      for (let i = 0; i < 10; i++) tracker.record('failed');
      expect(tracker.isEscalated()).toBe(false);
      expect(tracker.getPercentileBoost()).toBe(0);
    });

    it('de-escalates when rate recovers', () => {
      const tracker = new LandingTracker({
        windowSize: 10,
        warningThreshold: 0.70,
        autoEscalate: true,
      });
      // Drop to 50%
      for (let i = 0; i < 5; i++) tracker.record('confirmed');
      for (let i = 0; i < 5; i++) tracker.record('expired');
      expect(tracker.isEscalated()).toBe(true);
      // Recover to 100% — rolling window pushes failures out
      for (let i = 0; i < 10; i++) tracker.record('confirmed');
      expect(tracker.isEscalated()).toBe(false);
    });
  });

  describe('empty tracker', () => {
    it('reports zeros and no escalation', () => {
      const tracker = new LandingTracker();
      const report = tracker.getReport();
      expect(report.windowSubmitted).toBe(0);
      expect(report.landingRate).toBe(1); // empty = 100% (no failures)
      expect(tracker.isEscalated()).toBe(false);
    });
  });
});
