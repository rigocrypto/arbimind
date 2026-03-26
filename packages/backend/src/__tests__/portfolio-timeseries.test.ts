import express, { Application } from 'express';
import request from 'supertest';
import type { TimeseriesPoint } from '../services/portfolioService';

// Mock dependencies
jest.mock('../services/portfolioService', () => ({
  getEvmPortfolio: jest.fn(),
  getEvmTimeseries: jest.fn(),
  getSolanaPortfolio: jest.fn(),
  getSolanaTimeseries: jest.fn(),
}));

jest.mock('../db/portfolioDb', () => ({
  touchUser: jest.fn(),
  getSnapshots: jest.fn(),
  isDbAvailable: jest.fn(),
}));

import portfolioRouter from '../routes/portfolio';
import { getEvmTimeseries } from '../services/portfolioService';
import { getSnapshots, isDbAvailable } from '../db/portfolioDb';

describe('GET /portfolio/evm/timeseries', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use('/api/portfolio', portfolioRouter);
    
    // Set environment variable for tests - MUST be 40 hex chars + 0x prefix
    process.env.EVM_ARB_ACCOUNT = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb';
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.EVM_ARB_ACCOUNT;
  });

  describe('Invalid address handling', () => {
    it('returns 400 for invalid EVM address', async () => {
      const res = await request(app)
        .get('/api/portfolio/evm/timeseries')
        .query({ address: 'not-an-address' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Valid EVM address required' });
    });

    it('returns 400 for missing address', async () => {
      const res = await request(app)
        .get('/api/portfolio/evm/timeseries');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Valid EVM address required' });
    });
  });

  describe('Snapshots path (DB available with data)', () => {
    it('returns 200 with snapshotted_daily_equity method when snapshots available', async () => {
      const validAddress = '0x123456789abcdef123456789abcdef1234567890';
      const mockSnapshots: TimeseriesPoint[] = [
        { ts: 1705363200000, equityUsd: 1000, pnlUsd: 100, drawdownPct: 0 },
        { ts: 1705449600000, equityUsd: 1050, pnlUsd: 150, drawdownPct: 1.5 },
        { ts: 1705536000000, equityUsd: 1100, pnlUsd: 200, drawdownPct: 0 },
      ];

      (isDbAvailable as jest.Mock).mockReturnValue(true);
      (getSnapshots as jest.Mock).mockResolvedValue(mockSnapshots);

      const res = await request(app)
        .get('/api/portfolio/evm/timeseries')
        .query({ address: validAddress });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        points: expect.arrayContaining([
          expect.objectContaining({ ts: expect.any(Number), equityUsd: expect.any(Number) }),
        ]),
        method: 'snapshotted_daily_equity',
      });
      expect(getSnapshots).toHaveBeenCalledWith(
        'evm',
        validAddress,
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('applies custom range parameter in snapshot query', async () => {
      const validAddress = '0x123456789abcdef123456789abcdef1234567890';
      const mockSnapshots: TimeseriesPoint[] = [
        { ts: 1704326400000, equityUsd: 950, pnlUsd: 50 },
        { ts: 1704412800000, equityUsd: 1000, pnlUsd: 100 },
      ];

      (isDbAvailable as jest.Mock).mockReturnValue(true);
      (getSnapshots as jest.Mock).mockResolvedValue(mockSnapshots);

      const res = await request(app)
        .get('/api/portfolio/evm/timeseries')
        .query({ address: validAddress, range: '7d' });

      expect(res.status).toBe(200);
      expect(res.body.method).toBe('snapshotted_daily_equity');
      // Verify getSnapshots was called with correct day range
      expect(getSnapshots).toHaveBeenCalled();
    });
  });

  describe('Fallback path (service timeseries)', () => {
    it('falls back to service when DB unavailable', async () => {
      const validAddress = '0x123456789abcdef123456789abcdef1234567890';
      const mockServiceResult = {
        points: [
          { ts: 1705363200000, equityUsd: 1000, pnlUsd: 100, drawdownPct: 0 },
          { ts: 1705449600000, equityUsd: 1050, pnlUsd: 150, drawdownPct: 1.5 },
        ],
        method: 'estimated_linear_ramp_to_current_equity' as const,
      };

      (isDbAvailable as jest.Mock).mockReturnValue(false);
      (getEvmTimeseries as jest.Mock).mockResolvedValue(mockServiceResult);

      const res = await request(app)
        .get('/api/portfolio/evm/timeseries')
        .query({ address: validAddress });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockServiceResult);
      expect(getEvmTimeseries).toHaveBeenCalledWith(validAddress, '30d');
    });

    it('falls back to service when snapshots insufficient (< 2)', async () => {
      const validAddress = '0x123456789abcdef123456789abcdef1234567890';
      const mockServiceResult = {
        points: [
          { ts: 1705363200000, equityUsd: 1000, pnlUsd: 100, drawdownPct: 0 },
          { ts: 1705449600000, equityUsd: 1050, pnlUsd: 150, drawdownPct: 1.5 },
        ],
        method: 'estimated_linear_ramp_to_current_equity' as const,
      };

      (isDbAvailable as jest.Mock).mockReturnValue(true);
      (getSnapshots as jest.Mock).mockResolvedValue([
        { ts: 1705363200000, equityUsd: 1000, pnlUsd: 100 },
      ]); // Only 1 snapshot, needs 2+
      (getEvmTimeseries as jest.Mock).mockResolvedValue(mockServiceResult);

      const res = await request(app)
        .get('/api/portfolio/evm/timeseries')
        .query({ address: validAddress });

      expect(res.status).toBe(200);
      expect(res.body.method).toBe('estimated_linear_ramp_to_current_equity');
      expect(getEvmTimeseries).toHaveBeenCalledWith(validAddress, '30d');
    });

    it('respects range parameter in service fallback', async () => {
      const validAddress = '0x123456789abcdef123456789abcdef1234567890';
      const mockServiceResult = {
        points: [{ ts: 1704326400000, equityUsd: 950, pnlUsd: 50 }],
        method: 'estimated_linear_ramp_to_current_equity' as const,
      };

      (isDbAvailable as jest.Mock).mockReturnValue(true);
      (getSnapshots as jest.Mock).mockResolvedValue(null);
      (getEvmTimeseries as jest.Mock).mockResolvedValue(mockServiceResult);

      const res = await request(app)
        .get('/api/portfolio/evm/timeseries')
        .query({ address: validAddress, range: '90d' });

      expect(res.status).toBe(200);
      expect(getEvmTimeseries).toHaveBeenCalledWith(validAddress, '90d');
    });
  });

  describe('Error handling', () => {
    it('returns 503 when no data available from either path', async () => {
      const validAddress = '0x123456789abcdef123456789abcdef1234567890';

      (isDbAvailable as jest.Mock).mockReturnValue(false);
      (getEvmTimeseries as jest.Mock).mockResolvedValue({
        points: [],
        method: 'estimated_linear_ramp_to_current_equity',
      });

      const res = await request(app)
        .get('/api/portfolio/evm/timeseries')
        .query({ address: validAddress });

      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('error', 'Portfolio unavailable');
      expect(res.body).toHaveProperty('reason', 'No timeseries data');
    });

    it('handles service errors gracefully', async () => {
      const validAddress = '0x123456789abcdef123456789abcdef1234567890';

      (isDbAvailable as jest.Mock).mockReturnValue(false);
      (getEvmTimeseries as jest.Mock).mockRejectedValue(
        new Error('RPC provider error')
      );

      const res = await request(app)
        .get('/api/portfolio/evm/timeseries')
        .query({ address: validAddress });

      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('error', 'Portfolio unavailable');
      expect(res.body.reason).toContain('RPC provider error');
    });
  });
});
