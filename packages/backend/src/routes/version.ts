/**
 * Deploy verification endpoint.
 *
 * `startedAt` was previously computed per request (`new Date().toISOString()`),
 * so it always echoed the current time. That made the endpoint useless for its
 * stated purpose: during #370 a container that had been running for 15 hours
 * looked freshly started, and several "fixes" were evaluated against a process
 * that had never picked up the new configuration.
 *
 * The value is captured once at module load and served unchanged thereafter.
 */

import express, { Request, Response, Router } from 'express';

const router: Router = express.Router();

/** Wall-clock time this process started, derived from uptime at module load. */
export const PROCESS_STARTED_AT = new Date(
  Date.now() - Math.round(process.uptime() * 1000)
).toISOString();

router.get('/', (_req: Request, res: Response) =>
  res.json({
    ok: true,
    sha: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
    node: process.version,
    startedAt: PROCESS_STARTED_AT,
    uptimeSeconds: Math.round(process.uptime()),
  })
);

export default router;
