/**
 * Solana Bot API Routes
 * - GET  /api/solana/bot-status   — scanner + executor status
 * - POST /api/solana/bot-control  — start/stop/set-mode (admin-only)
 *
 * DEVNET ONLY.
 */

import express, { Request, Response, Router } from 'express';
import { adminAuth } from '../middleware/adminAuth';
import * as scanner from '../services/SolanaScanner';
import * as executor from '../services/SolanaExecutor';

const router: Router = express.Router();

// ---------------------------------------------------------------------------
// GET /bot-status — public read endpoint
// ---------------------------------------------------------------------------
router.get('/bot-status', async (_req: Request, res: Response) => {
  try {
    const scanStatus = scanner.getStatus();
    const tradeStats = executor.getTradeStats();
    const wallet = await executor.getWalletBalance();
    const queue = scanner.getQueue();
    const logs = scanner.getLogs();

    res.json({
      ok: true,
      mode: executor.getBotMode(),
      network: 'devnet' as const,
      walletBalance: wallet.walletBalance,
      treasuryBalance: wallet.treasuryBalance,
      walletAddress: wallet.address,
      scanActive: scanStatus.running,
      opportunitiesFound: scanStatus.opportunitiesFound,
      tradesExecuted: tradeStats.tradesExecuted,
      successRate: tradeStats.successRate,
      totalPnlSol: tradeStats.totalPnlSol,
      lastScanMs: scanStatus.lastScanDurationMs,
      lastScanAt: scanStatus.lastScanAt,
      totalScans: scanStatus.totalScans,
      lastQuoteAge: scanner.getLastQuoteAge(),
      isExecuting: executor.getIsExecuting(),
      minProfitBps: scanner.getMinProfitBps(),
      activePairs: scanner.getActivePairs(),
      skippedPairs: scanner.getSkippedPairs(),
      queue: queue.map((o) => ({
        id: o.id,
        pair: o.pair,
        spreadBps: o.spreadBps,
        expectedProfitSol: o.expectedProfitSol,
        route: o.route,
        confidence: o.confidence,
        detectedAt: o.detectedAt,
        status: o.status,
        result: o.result,
      })),
      tradeHistory: executor.getTradeHistory().slice(-50),
      logs: logs.slice(-100),
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to get bot status',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /bot-control — admin-only
// ---------------------------------------------------------------------------
router.post('/bot-control', adminAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      action?: 'start' | 'stop' | 'set-mode';
      mode?: 'paper' | 'live';
      confirm?: string;
    };

    if (!body?.action || !['start', 'stop', 'set-mode'].includes(body.action)) {
      res.status(400).json({ ok: false, error: 'action must be start | stop | set-mode' });
      return;
    }

    if (body.action === 'start') {
      try {
        executor.initializeExecutor();
      } catch (initErr) {
        res.status(500).json({
          ok: false,
          error: initErr instanceof Error ? initErr.message : 'Executor initialization failed',
        });
        return;
      }
      const currentMode = executor.getBotMode();
      if (currentMode === 'stopped') {
        executor.setBotMode('paper'); // default to paper when starting
      }
      scanner.startScanLoop();
      scanner.addLog('info', '[CTRL] Bot started');
      res.json({ ok: true, action: 'start', mode: executor.getBotMode() });
      return;
    }

    if (body.action === 'stop') {
      scanner.stopScanLoop();
      executor.setBotMode('stopped');
      scanner.addLog('info', '[CTRL] Bot stopped');
      res.json({ ok: true, action: 'stop', mode: 'stopped' });
      return;
    }

    // set-mode
    if (!body.mode || !['paper', 'live'].includes(body.mode)) {
      res.status(400).json({ ok: false, error: 'mode must be paper | live' });
      return;
    }

    // LIVE mode requires explicit confirmation token
    if (body.mode === 'live') {
      if (body.confirm !== 'ENABLE_LIVE_DEVNET') {
        res.status(400).json({
          ok: false,
          error: 'Switching to LIVE requires { confirm: "ENABLE_LIVE_DEVNET" }',
        });
        return;
      }

      // Validate wallet is funded
      const wallet = await executor.getWalletBalance();
      if (wallet.walletBalance < 0.05) {
        res.status(400).json({
          ok: false,
          error: `Wallet balance too low for live mode: ${wallet.walletBalance.toFixed(4)} SOL (need ≥ 0.05)`,
        });
        return;
      }

      scanner.addLog('warn', '[CTRL] ⚠️ LIVE mode enabled — real devnet transactions');
    } else {
      scanner.addLog('info', `[CTRL] Mode set to ${body.mode}`);
    }

    executor.setBotMode(body.mode);
    res.json({ ok: true, action: 'set-mode', mode: body.mode });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to control bot',
    });
  }
});

export default router;
