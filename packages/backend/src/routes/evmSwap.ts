import express, { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';

const router: Router = express.Router();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ZRX_API_KEY = process.env.EVM_SWAP_API_KEY?.trim() ?? '';
const ZRX_BASE = 'https://api.0x.org';

const SUPPORTED_CHAINS = new Set([1, 10, 42161, 8453]);

/** Chain-specific USDC addresses (source of truth — matches frontend USDC_BY_CHAIN) */
const USDC_ADDRESS: Record<number, string> = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// ---------------------------------------------------------------------------
// Rate limit — 2 req/s per IP for swap endpoints
// ---------------------------------------------------------------------------

const swapLimiter = rateLimit({
  windowMs: 1_000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'rate_limited', hint: 'Max 2 requests per second' },
  handler: (_req, res) =>
    res.status(429).json({ ok: false, error: 'rate_limited', hint: 'Max 2 requests per second' }),
});

router.use(swapLimiter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTokenAddress(token: string, chainId: number): string | null {
  const t = token.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(t)) return t;

  const upper = t.toUpperCase();
  if (upper === 'ETH') return NATIVE_TOKEN_ADDRESS;
  if (upper === 'USDC') return USDC_ADDRESS[chainId] ?? null;

  return null;
}

interface SwapBody {
  chainId?: number;
  sellToken?: string;
  buyToken?: string;
  sellAmount?: string;
  takerAddress?: string;
  slippageBps?: number;
}

function validateSwapBody(
  body: SwapBody
): { ok: true; chainId: number; sellToken: string; buyToken: string; sellAmount: string; takerAddress: string; slippageBps: number } | { ok: false; error: string } {
  const { chainId, sellToken, buyToken, sellAmount, takerAddress, slippageBps } = body;

  if (chainId == null || !SUPPORTED_CHAINS.has(chainId)) {
    return { ok: false, error: `chainId must be one of ${[...SUPPORTED_CHAINS].join(', ')}` };
  }

  if (!sellToken || !buyToken) {
    return { ok: false, error: 'sellToken and buyToken are required' };
  }

  const resolvedSell = resolveTokenAddress(sellToken, chainId);
  const resolvedBuy = resolveTokenAddress(buyToken, chainId);

  if (!resolvedSell) return { ok: false, error: `Unsupported sellToken: ${sellToken}` };
  if (!resolvedBuy) return { ok: false, error: `Unsupported buyToken: ${buyToken}` };

  if (resolvedSell.toLowerCase() === resolvedBuy.toLowerCase()) {
    return { ok: false, error: 'sellToken and buyToken must be different' };
  }

  if (!sellAmount || !/^\d+$/.test(sellAmount) || sellAmount === '0') {
    return { ok: false, error: 'sellAmount must be a positive integer string (smallest unit)' };
  }

  if (!takerAddress || !/^0x[a-fA-F0-9]{40}$/.test(takerAddress)) {
    return { ok: false, error: 'takerAddress must be a valid Ethereum address' };
  }

  const bps = slippageBps ?? 50;
  if (!Number.isInteger(bps) || bps < 1 || bps > 5000) {
    return { ok: false, error: 'slippageBps must be an integer between 1 and 5000' };
  }

  return { ok: true, chainId, sellToken: resolvedSell, buyToken: resolvedBuy, sellAmount, takerAddress, slippageBps: bps };
}

async function fetch0x(
  path: string,
  params: Record<string, string>
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  if (!ZRX_API_KEY) {
    return { ok: false, status: 500, error: 'EVM_SWAP_API_KEY not configured' };
  }

  const qs = new URLSearchParams(params).toString();
  const url = `${ZRX_BASE}${path}?${qs}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        '0x-api-key': ZRX_API_KEY,
        '0x-version': 'v2',
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(text) as Record<string, unknown>; } catch { /* ignore */ }

      const reason = (parsed?.reason as string) ?? (parsed?.validationErrors as string) ?? text.slice(0, 200);

      if (response.status === 429) {
        return { ok: false, status: 429, error: '0x API rate limited — try again shortly' };
      }
      if (response.status === 400) {
        const msg = reason.toLowerCase().includes('liquidity')
          ? 'Insufficient liquidity for this pair/amount'
          : `Bad request: ${reason}`;
        return { ok: false, status: 400, error: msg };
      }

      console.error(`[evmSwap] 0x ${path} HTTP ${response.status}: ${reason}`);
      return { ok: false, status: 502, error: 'Swap aggregator error — try again' };
    }

    const data = (await response.json()) as Record<string, unknown>;
    return { ok: true, data };
  } catch (err) {
    console.error('[evmSwap] 0x fetch error:', err);
    return { ok: false, status: 502, error: 'Unable to reach swap aggregator' };
  }
}

// ---------------------------------------------------------------------------
// POST /api/evm/swap/quote  — indicative price (no commitment)
// ---------------------------------------------------------------------------

router.post('/quote', async (req: Request, res: Response) => {
  const v = validateSwapBody(req.body as SwapBody);
  if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

  const result = await fetch0x('/swap/allowance-holder/price', {
    chainId: String(v.chainId),
    sellToken: v.sellToken,
    buyToken: v.buyToken,
    sellAmount: v.sellAmount,
    taker: v.takerAddress,
    slippageBps: String(v.slippageBps),
  });

  if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });

  const d = result.data;
  const issues = d.issues as Record<string, unknown> | undefined;
  const allowance = issues?.allowance as Record<string, unknown> | undefined;

  return res.json({
    ok: true,
    buyAmount: d.buyAmount,
    sellAmount: d.sellAmount,
    price: d.price,
    estimatedGas: d.gas ?? d.estimatedGas ?? null,
    sources: (d.route as Record<string, unknown> | undefined)?.fills ?? d.sources ?? [],
    allowanceTarget: allowance?.spender ?? d.allowanceTarget ?? null,
  });
});

// ---------------------------------------------------------------------------
// POST /api/evm/swap/tx  — firm quote with executable calldata
// ---------------------------------------------------------------------------

router.post('/tx', async (req: Request, res: Response) => {
  const v = validateSwapBody(req.body as SwapBody);
  if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

  const result = await fetch0x('/swap/allowance-holder/quote', {
    chainId: String(v.chainId),
    sellToken: v.sellToken,
    buyToken: v.buyToken,
    sellAmount: v.sellAmount,
    taker: v.takerAddress,
    slippageBps: String(v.slippageBps),
  });

  if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });

  const d = result.data;
  const tx = d.transaction as Record<string, unknown> | undefined;
  const issues = d.issues as Record<string, unknown> | undefined;
  const allowance = issues?.allowance as Record<string, unknown> | undefined;

  if (!tx?.to || !tx?.data) {
    return res.status(502).json({ ok: false, error: 'Incomplete transaction data from aggregator' });
  }

  return res.json({
    ok: true,
    to: tx.to,
    data: tx.data,
    value: tx.value ?? '0',
    gas: tx.gas ?? tx.gasLimit ?? null,
    buyAmount: d.buyAmount,
    sellAmount: d.sellAmount,
    allowanceTarget: allowance?.spender ?? d.allowanceTarget ?? null,
  });
});

export default router;
