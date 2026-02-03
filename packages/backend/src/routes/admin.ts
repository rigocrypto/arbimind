import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { adminAuth } from '../middleware/adminAuth';
import { adminStore } from '../store/adminStore';

const router = express.Router();

router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'rate_limited' },
    handler: (req, res) => res.status(429).json({ ok: false, error: 'rate_limited' }),
  })
);
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  return adminAuth(req, res, next);
});

const TREASURY = process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000';
const EXECUTION = process.env.EXECUTION_ADDRESS || '0x0000000000000000000000000000000000000000';

function getClientIp(req: Request): string {
  const ff = req.headers['x-forwarded-for'];
  if (typeof ff === 'string') return (ff.split(',')[0] ?? '').trim() || req.ip || 'unknown';
  return req.ip ?? (req.socket?.remoteAddress as string) ?? 'unknown';
}

/**
 * GET /api/admin/audit?limit=100
 */
router.get('/audit', (req: Request, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || '100', 10), 200);
  const events = adminStore.getAuditEvents(limit);
  return res.json({
    ok: true,
    version: '1.0',
    timestamp: new Date().toISOString(),
    events,
  });
});

/**
 * GET /api/admin/metrics?range=24h|7d|30d
 */
router.get('/metrics', (req: Request, res: Response) => {
  const range = (req.query.range as string) || '24h';
  const txs = adminStore.getTxs();
  const pnl = adminStore.getPnlHistory();
  const now = Date.now();
  const ms = range === '24h' ? 86400000 : range === '7d' ? 604800000 : 2592000000;
  const since = now - ms;
  const filtered = txs.filter((t) => t.time >= since);
  const successful = filtered.filter((t) => t.status === 'success');
  const failed = filtered.filter((t) => t.status === 'failed');
  const grossProfit = successful.reduce((s, t) => s + t.grossProfit, 0);
  const gasSpend = filtered.reduce((s, t) => s + t.gasCost, 0);
  const netProfit = grossProfit - gasSpend;
  const winRate = filtered.length > 0 ? (successful.length / filtered.length) * 100 : 0;
  const pnlFiltered = pnl.filter((p) => p.time >= since);

  return res.json({
    ok: true,
    version: '1.0',
    range,
    timestamp: new Date().toISOString(),
    metrics: {
      netProfit24h: netProfit,
      grossProfit,
      gasSpend,
      winRate: Math.round(winRate * 10) / 10,
      txCount: filtered.length,
      failedTxCount: failed.length,
      pnlSeries: pnlFiltered.map((p) => ({ time: p.time, netProfit: p.netProfit, gasCost: p.gasCost })),
    },
  });
});

/**
 * GET /api/admin/txs?cursor=&limit=&strategy=&status=
 */
router.get('/txs', (req: Request, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);
  const strategy = req.query.strategy as string | undefined;
  const status = req.query.status as string | undefined;
  let txs = adminStore.getTxs();
  if (strategy) txs = txs.filter((t) => t.strategy === strategy);
  if (status) txs = txs.filter((t) => t.status === status);
  const result = txs.slice(0, limit);
  return res.json({
    ok: true,
    version: '1.0',
    timestamp: new Date().toISOString(),
    txs: result,
    total: txs.length,
  });
});

/**
 * GET /api/admin/wallets
 */
router.get('/wallets', (req: Request, res: Response) => {
  return res.json({
    ok: true,
    version: '1.0',
    timestamp: new Date().toISOString(),
    wallets: {
      execution: {
        address: EXECUTION,
        balanceEth: null,
        balanceUsdc: null,
        lastUpdated: new Date().toISOString(),
      },
      treasury: {
        address: TREASURY,
        balanceEth: null,
        balanceUsdc: null,
        lastUpdated: new Date().toISOString(),
      },
    },
    note: 'Balances require RPC; add ethers getBalance when ready',
  });
});

/**
 * POST /api/admin/engine/pause
 */
router.post('/engine/pause', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  adminStore.setEnginePaused(true);
  adminStore.addAuditEvent({ type: 'admin_action', ip, path: '/engine/pause', action: 'engine_pause', success: true });
  console.log('⏸️ [ADMIN] Engine PAUSED');
  return res.json({
    ok: true,
    version: '1.0',
    paused: true,
    timestamp: Date.now(),
  });
});

/**
 * POST /api/admin/engine/resume
 */
router.post('/engine/resume', (req: Request, res: Response) => {
  const ip = getClientIp(req);
  adminStore.setEnginePaused(false);
  adminStore.addAuditEvent({ type: 'admin_action', ip, path: '/engine/resume', action: 'engine_resume', success: true });
  console.log('▶️ [ADMIN] Engine RESUMED');
  return res.json({
    ok: true,
    version: '1.0',
    paused: false,
    timestamp: Date.now(),
  });
});

/**
 * GET /api/admin/engine/status
 */
router.get('/engine/status', (req: Request, res: Response) => {
  return res.json({
    ok: true,
    paused: adminStore.isEnginePaused(),
    timestamp: Date.now(),
  });
});

export default router;
