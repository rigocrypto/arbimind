import express, { Request, Response } from 'express';
import { getLastSnapshotRun, isDbAvailable } from '../db/portfolioDb';

const router = express.Router();
const STALE_THRESHOLD_MS = 36 * 60 * 60 * 1000; // 36 hours

/**
 * GET /api/snapshots/health?chain=evm|solana
 * Public health check for snapshot job. Returns ok, lastRunAt, lastOkAt, stale.
 * Returns 503 if DATABASE_URL not set.
 */
router.get('/health', async (req: Request, res: Response) => {
  const chain = (req.query.chain as string)?.toLowerCase();
  if (chain !== 'evm' && chain !== 'solana') {
    return res.status(400).json({
      ok: false,
      error: 'chain required: evm | solana',
    });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({
      ok: false,
      error: 'DATABASE_URL not set – snapshots unavailable',
    });
  }

  const run = await getLastSnapshotRun(chain);
  const now = Date.now();

  if (!run) {
    return res.json({
      ok: true,
      lastRunAt: null,
      lastOkAt: null,
      stale: true,
    });
  }

  const lastRunAt = run.finishedAt?.getTime() ?? run.startedAt.getTime();
  const lastOkAt = run.ok === true ? lastRunAt : null;
  const stale = now - lastRunAt > STALE_THRESHOLD_MS;

  return res.json({
    ok: true,
    lastRunAt: run.finishedAt?.toISOString() ?? run.startedAt.toISOString(),
    lastOkAt: lastOkAt != null ? new Date(lastOkAt).toISOString() : null,
    stale,
  });
});

export default router;
