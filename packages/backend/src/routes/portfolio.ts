import express, { Request, Response } from 'express';
import {
  getEvmPortfolio,
  getEvmTimeseries,
  getSolanaPortfolio,
  getSolanaTimeseries,
} from '../services/portfolioService';
import { touchUser, getSnapshots, isDbAvailable } from '../db/portfolioDb';
import type { TimeseriesPoint } from '../services/portfolioService';

const router = express.Router();

function computeDrawdown(points: TimeseriesPoint[]): TimeseriesPoint[] {
  let peak = 0;
  return points.map((p) => {
    const eq = p.equityUsd ?? 0;
    peak = Math.max(peak, eq);
    const drawdownPct = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    return { ...p, drawdownPct };
  });
}

/** GET /api/portfolio/evm?address=0x... */
router.get('/evm', async (req: Request, res: Response) => {
  const address = (req.query.address as string)?.trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Valid EVM address required' });
  }
  try {
    const summary = await getEvmPortfolio(address);
    if (!summary) return res.status(503).json({ error: 'Portfolio unavailable' });
    touchUser('evm', address);
    return res.json(summary);
  } catch (err) {
    console.error('Portfolio EVM error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/** GET /api/portfolio/evm/timeseries?address=0x...&range=30d */
router.get('/evm/timeseries', async (req: Request, res: Response) => {
  const address = (req.query.address as string)?.trim();
  const range = ((req.query.range as string) || '30d').trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Valid EVM address required' });
  }
  try {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const now = Date.now();
    const fromDayTs = Math.floor((now - days * 86400000) / 86400000) * 86400000;
    const toDayTs = Math.floor(now / 86400000) * 86400000;

    if (isDbAvailable()) {
      const snapshots = await getSnapshots('evm', address, fromDayTs, toDayTs);
      if (snapshots && snapshots.length >= 2) {
        const points = computeDrawdown(snapshots);
        return res.json({ points, method: 'snapshotted_daily_equity' as const });
      }
    }

    const result = await getEvmTimeseries(address, range);
    return res.json(result);
  } catch (err) {
    console.error('Portfolio EVM timeseries error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/** GET /api/portfolio/solana?address=BASE58 */
router.get('/solana', async (req: Request, res: Response) => {
  const address = (req.query.address as string)?.trim();
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return res.status(400).json({ error: 'Valid Solana address required' });
  }
  try {
    const summary = await getSolanaPortfolio(address);
    if (!summary) return res.status(503).json({ error: 'Portfolio unavailable' });
    touchUser('solana', address);
    return res.json(summary);
  } catch (err) {
    console.error('Portfolio Solana error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/** GET /api/portfolio/solana/timeseries?address=BASE58&range=30d */
router.get('/solana/timeseries', async (req: Request, res: Response) => {
  const address = (req.query.address as string)?.trim();
  const range = ((req.query.range as string) || '30d').trim();
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return res.status(400).json({ error: 'Valid Solana address required' });
  }
  try {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const now = Date.now();
    const fromDayTs = Math.floor((now - days * 86400000) / 86400000) * 86400000;
    const toDayTs = Math.floor(now / 86400000) * 86400000;

    if (isDbAvailable()) {
      const snapshots = await getSnapshots('solana', address, fromDayTs, toDayTs);
      if (snapshots && snapshots.length >= 2) {
        const points = computeDrawdown(snapshots);
        return res.json({ points, method: 'snapshotted_daily_equity' as const });
      }
    }

    const result = await getSolanaTimeseries(address, range);
    return res.json(result);
  } catch (err) {
    console.error('Portfolio Solana timeseries error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
