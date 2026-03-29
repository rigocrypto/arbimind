import express, { Request, Response, Router } from 'express';

const router: Router = express.Router();

type Chain = 'EVM' | 'SOL';
type OpportunityStatus = 'READY' | 'NEEDS_APPROVAL' | 'LOW_BALANCE' | 'HIGH_RISK' | 'STALE';

type FeedOpportunity = {
  id: string;
  chain: Chain;
  ts: number;
  routeId: string;
  routeLabel: string;
  venues: string[];
  tokens: {
    in: string;
    out: string;
    mid?: string[];
  };
  size: {
    min: number;
    max: number;
    unit: string;
  };
  profit: {
    grossUsd: number;
    feesUsd: number;
    gasUsd?: number;
    priorityFeeUsd?: number;
    slippageUsd: number;
    netUsd: number;
    netBps: number;
  };
  scores: {
    confidence: number;
    mevRisk?: number;
    volatilityRisk?: number;
    execProbability?: number;
  };
  status: OpportunityStatus;
  reasons?: string[];
};

type FeedSnapshot = {
  items: FeedOpportunity[];
  generatedAt: number;
};

const BASE_OPPORTUNITIES: Omit<FeedOpportunity, 'ts'>[] = [
  {
    id: 'live-evm-1',
    chain: 'EVM',
    routeId: 'usdc-weth-usdc-uni-sushi',
    routeLabel: 'USDC -> WETH -> USDC',
    venues: ['UniswapV3', 'SushiSwap'],
    tokens: { in: 'USDC', out: 'USDC', mid: ['WETH'] },
    size: { min: 250, max: 5000, unit: 'USDC' },
    profit: {
      grossUsd: 18.4,
      feesUsd: 2.1,
      gasUsd: 6.3,
      slippageUsd: 3.2,
      netUsd: 6.8,
      netBps: 22,
    },
    scores: { confidence: 0.74, mevRisk: 0.42, execProbability: 0.63, volatilityRisk: 0.28 },
    status: 'NEEDS_APPROVAL',
    reasons: ['Token approval required for USDC', 'Two-hop route'],
  },
  {
    id: 'live-sol-1',
    chain: 'SOL',
    routeId: 'usdc-sol-usdc-jup-ray',
    routeLabel: 'USDC -> SOL -> USDC',
    venues: ['Jupiter', 'Raydium'],
    tokens: { in: 'USDC', out: 'USDC', mid: ['SOL'] },
    size: { min: 50, max: 2500, unit: 'USDC' },
    profit: {
      grossUsd: 9.2,
      feesUsd: 0.8,
      priorityFeeUsd: 0.2,
      slippageUsd: 1.1,
      netUsd: 7.1,
      netBps: 31,
    },
    scores: { confidence: 0.81, volatilityRisk: 0.22, execProbability: 0.77 },
    status: 'READY',
    reasons: ['Wallet-ready route', 'Low slippage'],
  },
  {
    id: 'live-sol-2',
    chain: 'SOL',
    routeId: 'bonk-sol-bonk-jupiter-orca',
    routeLabel: 'BONK -> SOL -> BONK',
    venues: ['Jupiter', 'Orca'],
    tokens: { in: 'BONK', out: 'BONK', mid: ['SOL'] },
    size: { min: 150, max: 4000, unit: 'USDC' },
    profit: {
      grossUsd: 11.7,
      feesUsd: 1.1,
      priorityFeeUsd: 0.4,
      slippageUsd: 2.8,
      netUsd: 7.4,
      netBps: 18,
    },
    scores: { confidence: 0.69, volatilityRisk: 0.63, execProbability: 0.58 },
    status: 'HIGH_RISK',
    reasons: ['High token volatility', 'Route size sensitive'],
  },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function createSnapshot(): FeedSnapshot {
  const now = Date.now();
  const tick = Math.floor(now / 2500);

  const items = BASE_OPPORTUNITIES.map((item, index) => {
    const netDrift = (((tick + index * 2) % 9) - 4) * 0.18;
    const confidenceDrift = (((tick + index * 3) % 7) - 3) * 0.015;
    const ageMs = 200 + ((tick + index * 17) % 6) * 420;

    const netUsd = clamp(Number((item.profit.netUsd + netDrift).toFixed(2)), 0, 9999);
    const confidence = clamp(Number((item.scores.confidence + confidenceDrift).toFixed(3)), 0.1, 0.99);
    const status: OpportunityStatus =
      now - ageMs > 10000
        ? 'STALE'
        : netUsd < 2
          ? 'LOW_BALANCE'
          : confidence < 0.55
            ? 'HIGH_RISK'
            : item.status;

    return {
      ...item,
      ts: now - ageMs,
      status,
      profit: {
        ...item.profit,
        netUsd,
      },
      scores: {
        ...item.scores,
        confidence,
      },
    };
  });

  return { items, generatedAt: now };
}

function writeSseEvent(res: Response, event: string, payload: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.get('/', (_req: Request, res: Response) => {
  return res.json(createSnapshot());
});

router.get('/stream', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  writeSseEvent(res, 'snapshot', createSnapshot());

  const snapshotInterval = setInterval(() => {
    writeSseEvent(res, 'snapshot', createSnapshot());
  }, 2500);

  const keepAliveInterval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  _req.on('close', () => {
    clearInterval(snapshotInterval);
    clearInterval(keepAliveInterval);
    res.end();
  });
});

export default router;
