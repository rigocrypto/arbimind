import express, { Request, Response } from 'express';
import * as strategies from '../services/strategies';
import { adminStore } from '../store/adminStore';

const router = express.Router();

let activeStrategy = '';
let currentReferrer: string | null = null;
let activeWalletChain: 'evm' | 'solana' | null = null;
let activeWalletAddress: string | null = null;
let scanInterval: ReturnType<typeof setInterval> | null = null;

const strategyRunners: Record<string, (opts?: { referrer?: string }) => Promise<void>> = {
  arbitrage: strategies.runArbitrage,
  trend: strategies.runTrend,
  'market-making': strategies.runMarketMaking,
};

function runLoop(): void {
  if (adminStore.isEnginePaused()) return;
  const run = strategyRunners[activeStrategy as keyof typeof strategyRunners];
  if (!run) return;
  const opts = currentReferrer ? { referrer: currentReferrer } : undefined;
  run(opts).catch(console.error);
}

router.post('/start', (req: Request, res: Response) => {
  try {
    const { strategy = 'arbitrage', referrer, walletAddress, walletChain } = req.body || {};
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

    if (scanInterval) clearInterval(scanInterval);
    const run = strategyRunners[strategy as keyof typeof strategyRunners];
    if (run) {
      scanInterval = setInterval(runLoop, 5000);
    }
    console.log(
      `🧠 [${strategy.toUpperCase()}] Engine STARTED${
        currentReferrer ? ` (ref: ${currentReferrer.slice(0, 10)}...)` : ''
      }${activeWalletChain && activeWalletAddress ? ` (wallet: ${activeWalletChain}:${activeWalletAddress.slice(0, 10)}...)` : ''}`
    );
    res.json({
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
    res.status(500).json({ success: false, message: 'Failed to start engine' });
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
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

router.post('/single-scan', async (req: Request, res: Response) => {
  try {
    const { strategy = activeStrategy || 'arbitrage' } = req.body || {};
    const run = strategyRunners[strategy as keyof typeof strategyRunners];
    if (run) {
      const opts = currentReferrer ? { referrer: currentReferrer } : undefined;
      await run(opts);
    }
    console.log(`🔍 Single scan: ${strategy}`);
    res.json({ status: 'scan-started', strategy, timestamp: Date.now() });
  } catch (error) {
    console.error('Single scan error:', error);
    res.status(500).json({ success: false, message: 'Single scan failed' });
  }
});

router.post('/reload-prices', async (req: Request, res: Response) => {
  try {
    // TODO: Cache bust, refresh DEX quotes when wired
    console.log('📊 Prices reload requested');
    res.json({ status: 'prices-refreshed', timestamp: Date.now() });
  } catch (error) {
    console.error('Reload prices error:', error);
    res.status(500).json({ success: false, message: 'Reload failed' });
  }
});

export default router;
