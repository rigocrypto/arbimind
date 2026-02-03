import express, { Request, Response } from 'express';

const router = express.Router();

// In-memory stub – replace with real scanner/DB when wired
const MOCK_OPPORTUNITIES = [
  {
    id: '1',
    pair: 'ETH/USDC',
    fromDex: 'Uniswap V3',
    toDex: 'SushiSwap',
    profitPct: 0.45,
    profitEth: 0.0012,
    gasEst: 0.0008,
    netGain: 0.0004,
    timestamp: Date.now() - 30000,
  },
  {
    id: '2',
    pair: 'WBTC/ETH',
    fromDex: 'Curve',
    toDex: 'Balancer',
    profitPct: 0.32,
    profitEth: 0.0009,
    gasEst: 0.0006,
    netGain: 0.0003,
    timestamp: Date.now() - 60000,
  },
];

router.get('/', (req: Request, res: Response) => {
  return res.json(MOCK_OPPORTUNITIES);
});

export default router;
