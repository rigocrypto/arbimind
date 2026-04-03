import express, { Request, Response, Router } from 'express';
import * as strategies from '../services/strategies';
import { adminStore } from '../store/adminStore';
import { emitEngineEvent, getEngineEvents } from '../services/engineActivity';

const router: Router = express.Router();

let activeStrategy = '';
let currentReferrer: string | null = null;
let activeWalletChain: 'evm' | 'solana' | null = null;
let activeWalletAddress: string | null = null;
let scanInterval: ReturnType<typeof setInterval> | null = null;
let lastOppsCount = 0;
let lastProfitSol = 0;
let lastScanAt: number | null = null;

const strategyRunners: Record<string, (opts?: { referrer?: string }) => Promise<strategies.StrategyRunSummary>> = {
  arbitrage: strategies.runArbitrage,
  trend: strategies.runTrend,
  'market-making': strategies.runMarketMaking,
};

// Allowlist derived from the runners map — validates user input before dynamic dispatch
const VALID_STRATEGIES = new Set<string>(Object.keys(strategyRunners));

function runLoop(): void {
  if (adminStore.isEnginePaused()) return;
  const run = strategyRunners[activeStrategy as keyof typeof strategyRunners];
  if (!run) return;
  const opts = currentReferrer ? { referrer: currentReferrer } : undefined;
  emitEngineEvent({
    level: 'info',
    type: 'engine.tick',
    msg: `Scanning strategy ${activeStrategy || 'unknown'}`,
    ...(activeStrategy ? { strategyId: activeStrategy } : {}),
  });

  run(opts)
    .then((summary) => {
      lastOppsCount = Number.isFinite(summary.oppsCount) ? Math.max(0, Math.floor(summary.oppsCount)) : 0;
      lastProfitSol = Number.isFinite(summary.lastProfitSol)
        ? Number(Number(summary.lastProfitSol).toFixed(6))
        : 0;
      lastScanAt = Date.now();

      emitEngineEvent({
        level: lastOppsCount > 0 ? 'info' : 'warn',
        type: lastOppsCount > 0 ? 'opportunity.found' : 'opportunity.none',
        msg:
          lastOppsCount > 0
            ? `${lastOppsCount} opportunities found; est profit ${lastProfitSol.toFixed(4)} SOL`
            : 'No opportunities met current thresholds',
        ...(activeStrategy ? { strategyId: activeStrategy } : {}),
        meta: {
          oppsCount: lastOppsCount,
          lastProfitSol,
          walletChain: activeWalletChain,
          walletAddress: activeWalletAddress,
        },
      });
    })
    .catch((error: unknown) => {
      console.error(error);
      emitEngineEvent({
        level: 'error',
        type: 'engine.error',
        msg: error instanceof Error ? error.message : 'Engine loop failure',
        ...(activeStrategy ? { strategyId: activeStrategy } : {}),
      });
    });
}

/**
 * Guard: block simulated engine unless SIMULATED_ENGINE_ENABLED=true.
 * Default-deny — does NOT depend on NODE_ENV being set correctly.
 */
function isEngineAllowed(): boolean {
  return process.env.SIMULATED_ENGINE_ENABLED === 'true';
}

router.post('/start', (req: Request, res: Response): Response => {
  if (!isEngineAllowed()) {
    console.warn('[ENGINE_BLOCKED] Simulated engine denied (SIMULATED_ENGINE_ENABLED !== "true")');
    return res.status(403).json({ status: 'blocked', message: 'Simulated engine disabled. Set SIMULATED_ENGINE_ENABLED=true to enable.' });
  }
  try {
    const { strategy = 'arbitrage', referrer, walletAddress, walletChain } = req.body || {};
    if (!VALID_STRATEGIES.has(strategy)) {
      return res.status(400).json({ status: 'error', message: `Invalid strategy. Must be one of: ${[...VALID_STRATEGIES].join(', ')}` });
    }

    // Idempotency: if same strategy is already running, return success without restarting
    if (activeStrategy === strategy && scanInterval !== null) {
      console.log(`[ENGINE_IDEMPOTENT] ${strategy} already running — no-op`);
      return res.json({
        status: 'success',
        strategy,
        active: true,
        idempotent: true,
        referrer: currentReferrer ?? undefined,
        walletChain: activeWalletChain ?? undefined,
        walletAddress: activeWalletAddress ?? undefined,
        timestamp: Date.now(),
      });
    }

    activeStrategy = strategy;
    currentReferrer = typeof referrer === 'string' && /^0x[a-fA-F0-9]{40}$/.test(referrer) ? referrer : null;
    const normalizedChain = walletChain === 'solana' || walletChain === 'evm' ? walletChain : null;
    const normalizedWalletAddress =
      typeof walletAddress === 'string' && walletAddress.trim().length > 0 ? walletAddress.trim() : null;

    const isValidEvmWallet =
      normalizedChain === 'evm' && normalizedWalletAddress !== null && /^0x[a-fA-F0-9]{40}$/.test(normalizedWalletAddress);
    const isValidSolanaWallet =
      normalizedChain === 'solana' &&
      normalizedWalletAddress !== null &&
      /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalizedWalletAddress);

    if (isValidEvmWallet || isValidSolanaWallet) {
      activeWalletChain = normalizedChain;
      activeWalletAddress = normalizedWalletAddress;
    } else {
      activeWalletChain = null;
      activeWalletAddress = null;
    }

    lastOppsCount = 0;
    lastProfitSol = 0;
    lastScanAt = null;

    if (scanInterval) clearInterval(scanInterval);
    const run = strategyRunners[strategy as keyof typeof strategyRunners];
    if (run) {
      scanInterval = setInterval(runLoop, 5000);
    }
    emitEngineEvent({
      level: 'info',
      type: 'engine.started',
      msg: `Strategy ${strategy} started`,
      strategyId: strategy,
      meta: {
        referrer: currentReferrer,
        walletChain: activeWalletChain,
        walletAddress: activeWalletAddress,
      },
    });
    console.log(
      `🧠 [${strategy.toUpperCase()}] Engine STARTED${
        currentReferrer ? ` (ref: ${currentReferrer.slice(0, 10)}...)` : ''
      }${activeWalletChain && activeWalletAddress ? ` (wallet: ${activeWalletChain}:${activeWalletAddress.slice(0, 10)}...)` : ''}`
    );
    return res.json({
      status: 'success',
      strategy,
      active: true,
      referrer: currentReferrer ?? undefined,
      walletChain: activeWalletChain ?? undefined,
      walletAddress: activeWalletAddress ?? undefined,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Engine start error:', error);
    return res.status(500).json({ success: false, message: 'Failed to start engine' });
  }
});

router.post('/stop', (req: Request, res: Response) => {
  try {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    activeStrategy = '';
    currentReferrer = null;
    activeWalletChain = null;
    activeWalletAddress = null;
    lastOppsCount = 0;
    lastProfitSol = 0;
    lastScanAt = null;
    emitEngineEvent({
      level: 'warn',
      type: 'engine.stopped',
      msg: 'Engine stopped',
    });
    console.log('🛑 Engine STOPPED');
    res.json({ status: 'success', active: false, timestamp: Date.now() });
  } catch (error) {
    console.error('Engine stop error:', error);
    res.status(500).json({ success: false, message: 'Failed to stop engine' });
  }
});

router.get('/status', (req: Request, res: Response) => {
  res.json({
    active: activeStrategy,
    walletChain: activeWalletChain,
    walletAddress: activeWalletAddress,
    oppsCount: lastOppsCount,
    lastProfit: lastProfitSol,
    lastScanAt,
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

router.get('/logs', (req: Request, res: Response) => {
  const sinceRaw = Number(req.query.since ?? 0);
  const limitRaw = Number(req.query.limit ?? 100);
  const since = Number.isFinite(sinceRaw) ? sinceRaw : 0;
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

  const events = getEngineEvents({ since, limit });
  res.json({
    success: true,
    count: events.length,
    events,
    now: Date.now(),
  });
});

router.post('/single-scan', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { strategy = activeStrategy || 'arbitrage' } = req.body || {};
    if (!VALID_STRATEGIES.has(strategy)) {
      return res.status(400).json({ status: 'error', message: `Invalid strategy. Must be one of: ${[...VALID_STRATEGIES].join(', ')}` });
    }
    emitEngineEvent({
      level: 'info',
      type: 'engine.scan.requested',
      msg: `Single scan requested for ${strategy}`,
      strategyId: strategy,
    });
    const run = strategyRunners[strategy as keyof typeof strategyRunners];
    if (run) {
      const opts = currentReferrer ? { referrer: currentReferrer } : undefined;
      const summary = await run(opts);
      lastOppsCount = Number.isFinite(summary.oppsCount) ? Math.max(0, Math.floor(summary.oppsCount)) : 0;
      lastProfitSol = Number.isFinite(summary.lastProfitSol)
        ? Number(Number(summary.lastProfitSol).toFixed(6))
        : 0;
      lastScanAt = Date.now();
      emitEngineEvent({
        level: lastOppsCount > 0 ? 'info' : 'warn',
        type: lastOppsCount > 0 ? 'opportunity.found' : 'opportunity.none',
        msg:
          lastOppsCount > 0
            ? `${lastOppsCount} opportunities found; est profit ${lastProfitSol.toFixed(4)} SOL`
            : 'No opportunities met current thresholds',
        strategyId: strategy,
        meta: {
          oppsCount: lastOppsCount,
          lastProfitSol,
        },
      });
    }
    console.log(`🔍 Single scan: ${strategy}`);
    return res.json({ status: 'scan-started', strategy, timestamp: Date.now() });
  } catch (error) {
    console.error('Single scan error:', error);
    const failedStrategyId =
      typeof req.body?.strategy === 'string' && req.body.strategy.trim().length > 0
        ? req.body.strategy
        : activeStrategy;
    emitEngineEvent({
      level: 'error',
      type: 'engine.scan.failed',
      msg: error instanceof Error ? error.message : 'Single scan failed',
      ...(failedStrategyId ? { strategyId: failedStrategyId } : {}),
    });
    return res.status(500).json({ success: false, message: 'Single scan failed' });
  }
});

router.post('/reload-prices', async (req: Request, res: Response) => {
  try {
    // TODO: Cache bust, refresh DEX quotes when wired
    console.log('📊 Prices reload requested');
    emitEngineEvent({
      level: 'info',
      type: 'engine.prices.reloaded',
      msg: 'Price reload requested',
      ...(activeStrategy ? { strategyId: activeStrategy } : {}),
    });
    res.json({ status: 'prices-refreshed', timestamp: Date.now() });
  } catch (error) {
    console.error('Reload prices error:', error);
    emitEngineEvent({
      level: 'error',
      type: 'engine.prices.reload-failed',
      msg: error instanceof Error ? error.message : 'Reload failed',
      ...(activeStrategy ? { strategyId: activeStrategy } : {}),
    });
    res.status(500).json({ success: false, message: 'Reload failed' });
  }
});

export default router;
