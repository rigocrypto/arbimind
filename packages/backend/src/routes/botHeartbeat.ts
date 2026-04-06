/**
 * Bot Heartbeat Bridge
 * Receives heartbeats from the production bot, exposes status to the dashboard.
 * POST /api/bot/heartbeat  — bot pushes after each scan cycle (service-key auth)
 * GET  /api/bot/status     — dashboard polls (public, read-only)
 */

import express, { Request, Response, Router } from 'express';

const router: Router = express.Router();

// ---------------------------------------------------------------------------
// In-memory heartbeat store (single bot instance)
// ---------------------------------------------------------------------------

interface BotHeartbeat {
  service: string;
  status: 'running' | 'stopped' | 'error';
  mode: 'dry-run' | 'live' | 'canary' | 'log-only';
  lastScanAt: string;
  scanDurationMs: number;
  pairsChecked: number;
  quotesOk: number;
  quotesFailed: number;
  opportunitiesFound: number;
  autoTrade: boolean;
  lastError: string | null;
  receivedAt: string;
}

let latestHeartbeat: BotHeartbeat | null = null;

const SERVICE_KEY = process.env.AI_SERVICE_KEY || '';

// ---------------------------------------------------------------------------
// POST /heartbeat — bot pushes after each scan
// ---------------------------------------------------------------------------

router.post('/heartbeat', (req: Request, res: Response) => {
  // Auth: require X-SERVICE-KEY
  const key = req.headers['x-service-key'] as string;
  if (!SERVICE_KEY || key !== SERVICE_KEY) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const body = req.body;
  if (!body || typeof body.service !== 'string') {
    return res.status(400).json({ ok: false, error: 'missing required field: service' });
  }

  latestHeartbeat = {
    service: String(body.service),
    status: body.status === 'running' || body.status === 'stopped' || body.status === 'error'
      ? body.status
      : 'running',
    mode: body.mode === 'live' || body.mode === 'canary' || body.mode === 'log-only'
      ? body.mode
      : 'dry-run',
    lastScanAt: typeof body.lastScanAt === 'string' ? body.lastScanAt : new Date().toISOString(),
    scanDurationMs: typeof body.scanDurationMs === 'number' ? body.scanDurationMs : 0,
    pairsChecked: typeof body.pairsChecked === 'number' ? body.pairsChecked : 0,
    quotesOk: typeof body.quotesOk === 'number' ? body.quotesOk : 0,
    quotesFailed: typeof body.quotesFailed === 'number' ? body.quotesFailed : 0,
    opportunitiesFound: typeof body.opportunitiesFound === 'number' ? body.opportunitiesFound : 0,
    autoTrade: body.autoTrade === true,
    lastError: typeof body.lastError === 'string' ? body.lastError : null,
    receivedAt: new Date().toISOString(),
  };

  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /status — dashboard reads latest heartbeat
// ---------------------------------------------------------------------------

router.get('/status', (_req: Request, res: Response) => {
  if (!latestHeartbeat) {
    return res.json({
      ok: true,
      connected: false,
      message: 'No heartbeat received from bot yet',
    });
  }

  const ageMs = Date.now() - new Date(latestHeartbeat.receivedAt).getTime();
  const stale = ageMs > 120_000; // 2 min without heartbeat = stale

  return res.json({
    ok: true,
    connected: !stale,
    stale,
    ageMs,
    ...latestHeartbeat,
  });
});

export default router;
