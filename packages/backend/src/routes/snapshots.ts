import express, { Request, Response, Router } from 'express';
import { getLastSnapshotRunResult } from '../db/portfolioDb';
import { sendDbFailure } from '../utils/dbResponse';

const router: Router = express.Router();
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

  // A database failure must never be reported as a healthy snapshot state.
  // Previously any error here collapsed into `null` and was rendered as
  // `{ok: true, stale: true}`, so this endpoint passed smoke throughout a total
  // database outage.
  const runResult = await getLastSnapshotRunResult(chain);
  if (!runResult.ok) {
    return sendDbFailure(res, runResult, 'snapshots');
  }

  const run = runResult.value;
  const now = Date.now();

  // Reached the database and it genuinely holds no run for this chain.
  if (!run) {
    return res.json({
      ok: true,
      lastRunAt: null,
      lastOkAt: null,
      stale: true,
      dbStatus: 'reachable',
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
