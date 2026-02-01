import express, { Request, Response } from 'express';
import * as strategies from '../services/strategies';

const router = express.Router();

let activeStrategy = '';
let scanInterval: ReturnType<typeof setInterval> | null = null;

const strategyRunners: Record<string, () => Promise<void>> = {
  arbitrage: strategies.runArbitrage,
  trend: strategies.runTrend,
  'market-making': strategies.runMarketMaking,
};

router.post('/start', (req: Request, res: Response) => {
  try {
    const { strategy = 'arbitrage' } = req.body || {};
    activeStrategy = strategy;
    if (scanInterval) clearInterval(scanInterval);
    const run = strategyRunners[strategy as keyof typeof strategyRunners];
    if (run) {
      scanInterval = setInterval(() => run().catch(console.error), 5000);
    }
    console.log(`🧠 [${strategy.toUpperCase()}] Engine STARTED`);
    res.json({ status: 'success', strategy, active: true, timestamp: Date.now() });
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
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

export default router;
