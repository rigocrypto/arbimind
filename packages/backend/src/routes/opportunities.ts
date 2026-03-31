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

// Returns both modern and legacy shapes for compatibility with older consumers.
router.get('/', (_req: Request, res: Response) => {
  const snapshot = createSnapshot();
  return res.json({
    items: snapshot.items,
    data: snapshot.items,
    generatedAt: snapshot.generatedAt,
  });
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

router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const { routeId, amount, cluster } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be a positive number',
      });
    }

    // Token mints
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const SOL_MINT = 'So11111111111111111111111111111111111111112';

    // Leg 1: USDC → SOL via Jupiter Quote API v6
    const leg1Url = 'https://quote-api.jup.ag/v6/quote?' +
      new URLSearchParams({
        inputMint: USDC_MINT,
        outputMint: SOL_MINT,
        amount: String(Math.round(amount * 1e6)), // USDC has 6 decimals
        slippageBps: '50',
      });

    const leg1Resp = await fetch(leg1Url);
    if (!leg1Resp.ok) {
      return res.status(502).json({
        success: false,
        error: `Jupiter leg 1 quote failed: ${leg1Resp.status}`,
      });
    }
    const leg1 = (await leg1Resp.json()) as { outAmount: string; priceImpactPct?: string };

    // Leg 2: SOL → USDC (reverse leg)
    const leg2Url = 'https://quote-api.jup.ag/v6/quote?' +
      new URLSearchParams({
        inputMint: SOL_MINT,
        outputMint: USDC_MINT,
        amount: leg1.outAmount,
        slippageBps: '50',
      });

    const leg2Resp = await fetch(leg2Url);
    if (!leg2Resp.ok) {
      return res.status(502).json({
        success: false,
        error: `Jupiter leg 2 quote failed: ${leg2Resp.status}`,
      });
    }
    const leg2 = (await leg2Resp.json()) as { outAmount: string; priceImpactPct?: string };

    const inputAmount = amount;
    const outputAmount = parseInt(leg2.outAmount) / 1e6;
    const netProfit = outputAmount - inputAmount;
    const estimatedFees = 0.005; // ~5000 lamports tx fee
    const netAfterFees = netProfit - estimatedFees;

    return res.json({
      success: true,
      simulation: {
        routeId: routeId || 'usdc-sol-usdc',
        cluster: cluster || 'mainnet-beta',
        inputAmount,
        outputAmount: Math.round(outputAmount * 1e6) / 1e6,
        netProfit: Math.round(netAfterFees * 1e6) / 1e6,
        netBps: Math.round((netAfterFees / inputAmount) * 10000),
        legs: [
          {
            venue: 'Jupiter',
            direction: 'buy',
            inToken: 'USDC',
            outToken: 'SOL',
            inAmount: inputAmount,
            outAmount: Math.round((parseInt(leg1.outAmount) / 1e9) * 1e6) / 1e6,
            priceImpact: leg1.priceImpactPct || '0',
          },
          {
            venue: 'Jupiter',
            direction: 'sell',
            inToken: 'SOL',
            outToken: 'USDC',
            inAmount: Math.round((parseInt(leg1.outAmount) / 1e9) * 1e6) / 1e6,
            outAmount: Math.round(outputAmount * 1e6) / 1e6,
            priceImpact: leg2.priceImpactPct || '0',
          },
        ],
        estimatedFees,
        willRevert: netAfterFees < 0,
        revertReason: netAfterFees < 0
          ? 'Negative profit after slippage and fees'
          : null,
        quotedAt: Date.now(),
      },
    });
  } catch (err: any) {
    console.error('[simulate] error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Simulation failed',
    });
  }
});

export default router;
