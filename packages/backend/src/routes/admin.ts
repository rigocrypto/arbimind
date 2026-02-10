import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { adminAuth } from '../middleware/adminAuth';
import { adminStore } from '../store/adminStore';
import { dispatchAlert, AlertWebhooks, AlertPrediction } from '../services/AlertService';
import {
  insertPrediction,
  listPredictions,
  listPendingPredictions,
  updatePredictionResult,
  getPredictionAccuracy,
} from '../db/portfolioDb';

const router = express.Router();

type DexSnapshot = {
  ts: number;
  priceUsd?: number;
  liquidityUsd?: number;
  volumeH24?: number;
  buysH1?: number;
  sellsH1?: number;
};

type WatchItem = {
  chain: string;
  pairAddress: string;
  createdAt: number;
  expiresAt: number;
  lastPolledAt?: number;
};

const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_SAMPLE_GAP_MS = 30 * 1000;
const DEDUPE_GAP_MS = 20 * 1000;
const WATCH_TTL_MS = 24 * 60 * 60 * 1000;
const WATCH_POLL_MS = 30 * 1000;
const dexHistory = new Map<string, DexSnapshot[]>();
const watchlist = new Map<string, WatchItem>();
let watchPollerStarted = false;

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
const DEXSCREENER_CHAIN_ID = (process.env.DEXSCREENER_CHAIN_ID || 'solana').trim();

/**
 * Alert Configuration Storage (in-memory)
 */
let alertConfig: AlertWebhooks = {
  telegram: process.env.ALERT_TELEGRAM_TOKEN && process.env.ALERT_TELEGRAM_CHAT_ID
    ? { token: process.env.ALERT_TELEGRAM_TOKEN, chatId: process.env.ALERT_TELEGRAM_CHAT_ID }
    : undefined,
  discord: process.env.ALERT_DISCORD_WEBHOOK,
  twitter: process.env.ALERT_TWITTER_BEARER_TOKEN,
  reddit: process.env.ALERT_REDDIT_CLIENT_ID && process.env.ALERT_REDDIT_SECRET && process.env.ALERT_REDDIT_SUBREDDIT
    ? {
        clientId: process.env.ALERT_REDDIT_CLIENT_ID,
        secret: process.env.ALERT_REDDIT_SECRET,
        subreddit: process.env.ALERT_REDDIT_SUBREDDIT,
      }
    : undefined,
};

function watchKey(chain: string, pair: string): string {
  return `${chain}:${pair}`;
}

function pruneWatchlist(): void {
  const now = Date.now();
  for (const [key, item] of watchlist.entries()) {
    if (item.expiresAt <= now) watchlist.delete(key);
  }
}

function recordDexSnapshot(chain: string, pair: string, p: any): DexSnapshot[] {
  const now = Date.now();
  const key = `dex:history:${chain}:${pair}`;
  const existing = dexHistory.get(key) ?? [];
  const last = existing[existing.length - 1];

  if (!last || now - last.ts >= DEDUPE_GAP_MS) {
    if (!last || now - last.ts >= MIN_SAMPLE_GAP_MS) {
      existing.push({
        ts: now,
        priceUsd: Number(p?.priceUsd ?? 0),
        liquidityUsd: Number(p?.liquidity?.usd ?? 0),
        volumeH24: Number(p?.volume?.h24 ?? 0),
        buysH1: Number(p?.txns?.h1?.buys ?? 0),
        sellsH1: Number(p?.txns?.h1?.sells ?? 0),
      });
    }
  }

  const cutoff = now - HISTORY_WINDOW_MS;
  const trimmed = existing.filter((pt) => pt.ts >= cutoff);
  dexHistory.set(key, trimmed);
  return trimmed;
}

async function fetchDexPair(chain: string, pair: string): Promise<any | null> {
  const url = `https://api.dexscreener.com/latest/dex/pairs/${chain}/${pair}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const data = (await r.json()) as { pairs?: Array<any> };
  return data.pairs?.[0] ?? null;
}

async function evaluatePendingPredictions(chain: string, pair?: string, neutralThreshold = 0.1): Promise<number> {
  const pending = await listPendingPredictions(pair, chain);
  if (!pending.length) return 0;
  let evaluated = 0;
  for (const p of pending) {
    const targetTs = new Date(p.createdAt).getTime() + p.horizonSec * 1000;
    const key = `dex:history:${chain}:${p.pairAddress}`;
    const history = dexHistory.get(key) ?? [];
    if (!history.length) continue;

    const nearest = findNearest(history, targetTs);
    if (!nearest?.priceUsd || !p.entryPriceUsd) continue;

    const returnPct = ((nearest.priceUsd - p.entryPriceUsd) / p.entryPriceUsd) * 100;
    const signal = (p.signal ?? '').toUpperCase();
    const correct = signal === 'SHORT'
      ? returnPct < 0
      : signal === 'NEUTRAL'
        ? Math.abs(returnPct) < neutralThreshold
        : returnPct > 0;

    const ok = await updatePredictionResult(p.id, {
      resolvedAt: new Date(targetTs),
      exitPriceUsd: nearest.priceUsd,
      returnPct,
      correct,
    });
    if (ok) evaluated++;
  }
  return evaluated;
}

function startWatchlistPoller(): void {
  if (watchPollerStarted) return;
  watchPollerStarted = true;

  setInterval(async () => {
    pruneWatchlist();
    const items = Array.from(watchlist.values());
    if (!items.length) return;

    for (const item of items) {
      try {
        const pairData = await fetchDexPair(item.chain, item.pairAddress);
        if (!pairData) continue;
        recordDexSnapshot(item.chain, item.pairAddress, pairData);
        await evaluatePendingPredictions(item.chain, item.pairAddress);
        item.lastPolledAt = Date.now();
        watchlist.set(watchKey(item.chain, item.pairAddress), item);
      } catch {
        // ignore transient errors
      }
    }
  }, WATCH_POLL_MS);
}

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
 * GET /api/admin/ai-dashboard/dex?pair=<pairAddress>
 */
router.get('/ai-dashboard/dex', async (req: Request, res: Response) => {
  try {
    const pair = (req.query.pair as string | undefined)?.trim();
    if (!pair) {
      return res.status(400).json({ ok: false, error: 'pair_required' });
    }

    const p = await fetchDexPair(DEXSCREENER_CHAIN_ID, pair);
    if (!p) {
      return res.status(502).json({ ok: false, error: 'dexscreener_failed' });
    }
    if (!p) {
      return res.status(404).json({ ok: false, error: 'pair_not_found' });
    }

    const h24Vol = Number(p?.volume?.h24 ?? 0);
    const h1Vol = Number(p?.volume?.h1 ?? 0);
    const avgH1Vol = h24Vol > 0 ? h24Vol / 24 : 0;
    const volSpike = avgH1Vol > 0 && h1Vol / avgH1Vol >= 5;

    const h24Tx = Number(p?.txns?.h24?.buys ?? 0) + Number(p?.txns?.h24?.sells ?? 0);
    const h1Tx = Number(p?.txns?.h1?.buys ?? 0) + Number(p?.txns?.h1?.sells ?? 0);
    const avgH1Tx = h24Tx > 0 ? h24Tx / 24 : 0;
    const txSpike = avgH1Tx > 0 && h1Tx / avgH1Tx >= 5;

    const trimmed = recordDexSnapshot(DEXSCREENER_CHAIN_ID, pair, p);

    return res.json({
      ok: true,
      pair: {
        chainId: p?.chainId,
        chainKey: DEXSCREENER_CHAIN_ID,
        dexId: p?.dexId,
        pairAddress: p?.pairAddress,
        baseToken: p?.baseToken,
        quoteToken: p?.quoteToken,
        priceUsd: Number(p?.priceUsd ?? 0),
        priceChange: p?.priceChange ?? {},
        volume: p?.volume ?? {},
        liquidity: p?.liquidity ?? {},
        txns: p?.txns ?? {},
      },
      alerts: {
        volumeSpike: !!volSpike,
        txSpike: !!txSpike,
      },
      historySize: trimmed.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'ai_dashboard_failed' });
  }
});

/**
 * GET /api/admin/ai-dashboard/dex/history?pair=<pairAddress>&window=6h|24h|7d
 */
router.get('/ai-dashboard/dex/history', (req: Request, res: Response) => {
  const pair = (req.query.pair as string | undefined)?.trim();
  if (!pair) {
    return res.status(400).json({ ok: false, error: 'pair_required' });
  }

  const window = (req.query.window as string | undefined) ?? '24h';
  const windowMs = parseWindow(window);
  const key = `dex:history:${DEXSCREENER_CHAIN_ID}:${pair}`;
  const allPoints = dexHistory.get(key) ?? [];
  const points = allPoints.filter((pt) => pt.ts >= Date.now() - windowMs);
  const newest = points[points.length - 1]?.ts;
  const oldest = points[0]?.ts;

  return res.json({
    ok: true,
    pair,
    points,
    window,
    meta: {
      returnedPoints: points.length,
      totalPointsForPair: allPoints.length,
      samplingSeconds: Math.floor(MIN_SAMPLE_GAP_MS / 1000),
      retentionHours: Math.floor(HISTORY_WINDOW_MS / (60 * 60 * 1000)),
      newestTs: newest,
      oldestTs: oldest,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/admin/ai-dashboard/predictions
 */
router.post('/ai-dashboard/predictions', async (req: Request, res: Response) => {
  try {
    const {
      pairAddress,
      chain = DEXSCREENER_CHAIN_ID,
      horizonSec = 900,
      model,
      signal,
      confidence,
      entryPriceUsd,
      externalId,
      features,
      reason,
      alertContext,
    } = req.body ?? {};

    if (!pairAddress) {
      return res.status(400).json({ ok: false, error: 'pair_required' });
    }

    const key = `dex:history:${chain}:${pairAddress}`;
    const history = dexHistory.get(key) ?? [];
    const last = history[history.length - 1];
    const entry = entryPriceUsd ?? last?.priceUsd ?? null;

    const id = await insertPrediction({
      externalId,
      chain,
      pairAddress,
      horizonSec,
      model,
      signal,
      confidence,
      entryPriceUsd: entry ?? undefined,
      features,
      reason,
      alertContext,
    });

    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'prediction_insert_failed' });
  }
});

/**
 * GET /api/admin/ai-dashboard/predictions?pair=...&window=24h&limit=200
 */
router.get('/ai-dashboard/predictions', async (req: Request, res: Response) => {
  const pair = (req.query.pair as string | undefined)?.trim() ?? null;
  const window = (req.query.window as string | undefined) ?? '24h';
  const limit = Math.min(parseInt((req.query.limit as string) || '200', 10), 500);
  const rows = await listPredictions(pair, window, limit);
  return res.json({ ok: true, rows });
});

/**
 * POST /api/admin/ai-dashboard/predictions/evaluate?pair=...&neutralThreshold=0.1
 */
router.post('/ai-dashboard/predictions/evaluate', async (req: Request, res: Response) => {
  const pair = (req.query.pair as string | undefined)?.trim();
  const chain = (req.query.chain as string | undefined)?.trim() || DEXSCREENER_CHAIN_ID;
  const neutralThreshold = Number(req.query.neutralThreshold ?? 0.1);
  const evaluated = await evaluatePendingPredictions(chain, pair, neutralThreshold);
  return res.json({ ok: true, evaluated });
});

/**
 * GET /api/admin/ai-dashboard/watchlist
 */
router.get('/ai-dashboard/watchlist', (_req: Request, res: Response) => {
  pruneWatchlist();
  const items = Array.from(watchlist.values()).map((item) => ({
    chain: item.chain,
    pairAddress: item.pairAddress,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    lastPolledAt: item.lastPolledAt ?? null,
  }));
  return res.json({ ok: true, count: items.length, items });
});

/**
 * POST /api/admin/ai-dashboard/watch
 */
router.post('/ai-dashboard/watch', (req: Request, res: Response) => {
  const pairAddress = (req.body?.pairAddress as string | undefined)?.trim();
  const chain = ((req.body?.chain as string | undefined)?.trim() || DEXSCREENER_CHAIN_ID);
  const ttlHours = Number(req.body?.ttlHours ?? 24);
  if (!pairAddress) return res.status(400).json({ ok: false, error: 'pair_required' });

  const now = Date.now();
  const expiresAt = now + Math.max(ttlHours, 1) * 60 * 60 * 1000;
  const item: WatchItem = {
    chain,
    pairAddress,
    createdAt: now,
    expiresAt,
  };
  watchlist.set(watchKey(chain, pairAddress), item);
  startWatchlistPoller();
  pruneWatchlist();

  return res.json({ ok: true, item, count: watchlist.size });
});

/**
 * DELETE /api/admin/ai-dashboard/watch?pair=...&chain=...
 */
router.delete('/ai-dashboard/watch', (req: Request, res: Response) => {
  const pairAddress = (req.query.pair as string | undefined)?.trim();
  const chain = ((req.query.chain as string | undefined)?.trim() || DEXSCREENER_CHAIN_ID);
  if (!pairAddress) return res.status(400).json({ ok: false, error: 'pair_required' });

  watchlist.delete(watchKey(chain, pairAddress));
  pruneWatchlist();
  return res.json({ ok: true, count: watchlist.size });
});

/**
 * GET /api/admin/ai-dashboard/predictions/accuracy?pair=...&window=7d
 */
router.get('/ai-dashboard/predictions/accuracy', async (req: Request, res: Response) => {
  const pair = (req.query.pair as string | undefined)?.trim() ?? null;
  const window = (req.query.window as string | undefined) ?? '7d';
  const rows = await getPredictionAccuracy(pair, window);
  return res.json({ ok: true, rows });
});

function parseWindow(input: string): number {
  const v = input.trim().toLowerCase();
  if (v.endsWith('h')) {
    const n = Number(v.replace('h', ''));
    return Number.isFinite(n) ? n * 60 * 60 * 1000 : HISTORY_WINDOW_MS;
  }
  if (v.endsWith('d')) {
    const n = Number(v.replace('d', ''));
    return Number.isFinite(n) ? n * 24 * 60 * 60 * 1000 : HISTORY_WINDOW_MS;
  }
  return HISTORY_WINDOW_MS;
}

function findNearest(points: DexSnapshot[], targetTs: number): DexSnapshot | undefined {
  let best: DexSnapshot | undefined;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const pt of points) {
    const diff = Math.abs(pt.ts - targetTs);
    if (diff < bestDiff) {
      best = pt;
      bestDiff = diff;
    }
  }
  return best;
}

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

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 200;
const MAX_SNAPSHOT_USERS = parseInt(process.env.MAX_SNAPSHOT_USERS_PER_RUN || '500', 10) || 500;

/**
 * POST /api/admin/snapshots/run?chain=evm|solana&range=30d
 * Runs daily snapshot job for active users. Call via Railway Cron or external scheduler.
 * Uses advisory lock to prevent concurrent runs; returns 409 if already running.
 */
router.post('/snapshots/run', async (req: Request, res: Response) => {
  const chain = (req.query.chain as string)?.toLowerCase();
  const range = (req.query.range as string) || '30d';
  if (chain !== 'evm' && chain !== 'solana') {
    return res.status(400).json({
      ok: false,
      error: 'chain required: evm | solana',
      version: '1.0',
    });
  }
  const daysBack = range === '7d' ? 7 : range === '90d' ? 90 : 30;

  const {
    getActiveUsers,
    upsertSnapshot,
    isDbAvailable,
    runWithSnapshotLock,
    insertSnapshotRun,
    updateSnapshotRun,
    cleanupSnapshotRuns,
  } = await import('../db/portfolioDb');
  const { getEvmPortfolio, getSolanaPortfolio } = await import('../services/portfolioService');

  if (!isDbAvailable()) {
    return res.status(503).json({
      ok: false,
      error: 'DATABASE_URL not set – snapshots unavailable',
      version: '1.0',
    });
  }

  const startMs = Date.now();
  const out = await runWithSnapshotLock(chain, async () => {
    const runId = await insertSnapshotRun(chain);
    try {
      const users = await getActiveUsers(chain, daysBack, MAX_SNAPSHOT_USERS);
      const dayTs = Math.floor(Date.now() / 86400000) * 86400000;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        for (const userAddress of batch) {
          try {
            const summary =
              chain === 'evm'
                ? await getEvmPortfolio(userAddress)
                : await getSolanaPortfolio(userAddress);
            if (!summary) continue;

            const equityUsd = summary.totals.equityUsd ?? 0;
            const cumDeposited = summary.totals.depositedUsd ?? 0;
            const cumWithdrawn = summary.totals.withdrawnUsd ?? 0;
            const pnlUsd = equityUsd - cumDeposited + cumWithdrawn;

            const ok = await upsertSnapshot({
              chain,
              userAddress,
              dayTs,
              equityUsd,
              cumDepositedUsd: cumDeposited,
              cumWithdrawnUsd: cumWithdrawn,
              pnlUsd,
            });
            if (ok) success++;
            else failed++;
          } catch (err) {
            console.warn(`[snapshots] ${chain} ${userAddress}:`, err);
            failed++;
          }
        }
        if (i + BATCH_SIZE < users.length) {
          await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      const durationMs = Date.now() - startMs;
      if (runId) {
        await updateSnapshotRun(runId, {
          ok: true,
          usersProcessed: users.length,
          successCount: success,
          failedCount: failed,
          durationMs,
        });
      }
      // Run retention cleanup probabilistically (~1% of runs) to avoid extra DB work every time
      if (Math.random() < 0.01) {
        void cleanupSnapshotRuns(90);
      }
      return { usersProcessed: users.length, success, failed, dayTs };
    } catch (err) {
      const durationMs = Date.now() - startMs;
      if (runId) {
        await updateSnapshotRun(runId, {
          ok: false,
          usersProcessed: 0,
          successCount: 0,
          failedCount: 0,
          durationMs,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  });

  if (!out.acquired) {
    return res.status(200).json({
      ok: false,
      reason: 'already_running',
      acquiredLock: false,
      chain,
      limitUsed: MAX_SNAPSHOT_USERS,
      version: '1.0',
    });
  }

  const durationMs = Date.now() - startMs;
  return res.json({
    ok: true,
    chain,
    range,
    ...out.result,
    acquiredLock: true,
    limitUsed: MAX_SNAPSHOT_USERS,
    batchSize: BATCH_SIZE,
    delayMs: BATCH_DELAY_MS,
    durationMs,
    timestamp: Date.now(),
  });
});

/**
 * GET /api/admin/snapshots/last-run?chain=evm|solana
 * Returns the last snapshot run record for the chain.
 */
router.get('/snapshots/last-run', async (req: Request, res: Response) => {
  const chain = (req.query.chain as string)?.toLowerCase();
  if (chain !== 'evm' && chain !== 'solana') {
    return res.status(400).json({
      ok: false,
      error: 'chain required: evm | solana',
      version: '1.0',
    });
  }

  const { getLastSnapshotRun, isDbAvailable } = await import('../db/portfolioDb');
  if (!isDbAvailable()) {
    return res.status(503).json({
      ok: false,
      error: 'DATABASE_URL not set – snapshots unavailable',
      version: '1.0',
    });
  }

  const run = await getLastSnapshotRun(chain);
  if (!run) {
    return res.json({
      ok: true,
      version: '1.0',
      run: null,
    });
  }

  return res.json({
    ok: true,
    version: '1.0',
    run: {
      id: run.id,
      chain: run.chain,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      ok: run.ok,
      usersProcessed: run.usersProcessed,
      successCount: run.successCount,
      failedCount: run.failedCount,
      durationMs: run.durationMs,
      error: run.error,
    },
  });
});

/**
 * GET /api/admin/ai-dashboard/alert-config
 * Retrieve current alert configuration
 */
router.get('/ai-dashboard/alert-config', async (req: Request, res: Response) => {
  return res.json({
    ok: true,
    config: {
      telegram: alertConfig.telegram ? { chatId: alertConfig.telegram.chatId } : undefined, // Don't send token
      discord: alertConfig.discord ? true : false,
      twitter: alertConfig.twitter ? true : false,
      reddit: alertConfig.reddit ? { subreddit: alertConfig.reddit.subreddit } : undefined, // Don't send credentials
      minConfidence: parseFloat(process.env.ALERT_MIN_CONFIDENCE || '0.8'),
    },
  });
});

/**
 * POST /api/admin/ai-dashboard/alert-config
 * Update alert configuration
 */
router.post('/ai-dashboard/alert-config', async (req: Request, res: Response) => {
  try {
    const {
      telegram,
      discord,
      twitter,
      reddit,
    } = req.body ?? {};

    if (telegram?.token && telegram?.chatId) {
      alertConfig.telegram = { token: telegram.token, chatId: telegram.chatId };
    } else {
      alertConfig.telegram = undefined;
    }

    if (discord) {
      alertConfig.discord = discord;
    } else {
      alertConfig.discord = undefined;
    }

    if (twitter) {
      alertConfig.twitter = twitter;
    } else {
      alertConfig.twitter = undefined;
    }

    if (reddit?.clientId && reddit?.secret && reddit?.subreddit) {
      alertConfig.reddit = {
        clientId: reddit.clientId,
        secret: reddit.secret,
        subreddit: reddit.subreddit,
      };
    } else {
      alertConfig.reddit = undefined;
    }

    return res.json({ ok: true, message: 'Alert config updated' });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Failed to update alert config',
    });
  }
});

/**
 * POST /api/admin/ai-dashboard/alerts
 * Dispatch alert for a prediction
 */
router.post('/ai-dashboard/alerts', async (req: Request, res: Response) => {
  try {
    const prediction = req.body?.prediction as AlertPrediction | undefined;

    if (!prediction) {
      return res.status(400).json({ ok: false, error: 'prediction_required' });
    }

    const results = await dispatchAlert(prediction, alertConfig);

    return res.json({
      ok: true,
      dispatched: results,
      message: 'Alert dispatched to configured webhooks',
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Failed to dispatch alert',
    });
  }
});

export default router;
