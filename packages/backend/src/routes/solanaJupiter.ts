import express, { Request, Response } from 'express';
import {
  AddressLookupTableAccount,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

const JUPITER_API_BASES = [
  process.env.SOLANA_JUPITER_API_BASE?.trim() || '',
  'https://lite-api.jup.ag',
  'https://quote-api.jup.ag',
].filter(Boolean);

const SOLANA_RPC_ENDPOINTS = [
  process.env.SOLANA_JUPITER_RPC_URL?.trim() || '',
  process.env.SOLANA_JUPITER_RPC_FALLBACK_URL?.trim() || '',
  'https://api.mainnet-beta.solana.com',
].filter(Boolean);

const WSOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

type JupiterQuoteResponse = {
  inAmount: string;
  outAmount: string;
  priceImpactPct?: string;
};

type JupiterSwapResponse = {
  swapTransaction?: string;
};

function feeLamportsFromSolAmount(solAmount: number): number {
  const pct = Number(process.env.SOLANA_FEE_PCT ?? '0.5');
  const minSol = Number(process.env.SOLANA_FEE_MIN_SOL ?? '0.001');
  const min = Math.floor(minSol * LAMPORTS_PER_SOL);
  const base = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const pctFee = Math.floor(base * (pct / 100));
  return Math.max(min, pctFee);
}

async function fetchAltAccounts(
  connection: Connection,
  tx: VersionedTransaction
): Promise<AddressLookupTableAccount[]> {
  const lookups = tx.message.addressTableLookups ?? [];
  const alts: AddressLookupTableAccount[] = [];
  for (const l of lookups) {
    const key = new PublicKey(l.accountKey);
    const r = await connection.getAddressLookupTable(key);
    if (r.value) alts.push(r.value);
  }
  return alts;
}

const router = express.Router();
const rpcConnections = SOLANA_RPC_ENDPOINTS.map((endpoint) => new Connection(endpoint, 'confirmed'));

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function computeBackoffDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const retryAfterSeconds = Number(retryAfterHeader ?? '');
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(6000, Math.floor(retryAfterSeconds * 1000));
  }

  const base = 400;
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(6000, base * 2 ** attempt + jitter);
}

async function withRpcFallback<T>(taskName: string, fn: (connection: Connection) => Promise<T>): Promise<T> {
  const failures: string[] = [];
  for (const connection of rpcConnections) {
    try {
      return await fn(connection);
    } catch (error) {
      failures.push(
        `${connection.rpcEndpoint}: ${error instanceof Error ? error.message : `${taskName} failed`}`
      );
    }
  }

  throw new Error(`All RPC endpoints failed for ${taskName}: ${failures.join(' | ')}`);
}

async function fetchJsonFromJupiter<T>(options: {
  endpoints: Array<'/v6/quote' | '/v6/swap' | '/swap/v1/quote' | '/swap/v1/swap'>;
  query?: URLSearchParams;
  init?: RequestInit;
  maxAttempts?: number;
}): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; details?: string }> {
  const { endpoints, query, init, maxAttempts = 3 } = options;
  const failures: string[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let sawTransientFailure = false;
    let retryAfterHeader: string | null = null;

    for (const endpoint of endpoints) {
      for (const base of JUPITER_API_BASES) {
        const qs = query ? `?${query.toString()}` : '';
        const url = `${base}${endpoint}${qs}`;
        try {
          const response = await fetch(url, init);
          if (!response.ok) {
            const text = await response.text().catch(() => '');
            failures.push(
              `${base}${endpoint}: HTTP ${response.status}${text ? ` (${text.slice(0, 120)})` : ''}`
            );
            if (isTransientStatus(response.status)) {
              sawTransientFailure = true;
              retryAfterHeader = response.headers.get('retry-after') || retryAfterHeader;
            }
            continue;
          }

          const payload = (await response.json()) as T;
          return { ok: true, data: payload };
        } catch (error) {
          sawTransientFailure = true;
          failures.push(`${base}${endpoint}: ${error instanceof Error ? error.message : 'fetch failed'}`);
        }
      }
    }

    if (!sawTransientFailure || attempt >= maxAttempts - 1) {
      break;
    }

    await delay(computeBackoffDelayMs(attempt, retryAfterHeader));
  }

  return {
    ok: false,
    status: 502,
    error:
      endpoints.some((e) => e.includes('quote'))
        ? 'Jupiter quote failed'
        : 'Jupiter swap build failed',
    details: failures.join(' | ') || 'All Jupiter API hosts failed',
  };
}

/**
 * POST /api/solana/jupiter/swap-tx
 * Build unsigned v0 swap tx (Jupiter) + SOL fee. User signs/sends from UI.
 * Mainnet-beta only.
 */
router.post('/swap-tx', async (req: Request, res: Response) => {
  try {
    const feeWallet = process.env.SOLANA_FEE_WALLET?.trim();
    if (!feeWallet) {
      return res.status(500).json({ error: 'SOLANA_FEE_WALLET not configured' });
    }

    const body = req.body as {
      userPubkey?: string;
      side?: 'SOL_TO_USDC' | 'USDC_TO_SOL';
      amount?: number;
      slippageBps?: number;
    };

    if (!body?.userPubkey) {
      return res.status(400).json({ error: 'userPubkey required' });
    }
    if (!body?.side || !['SOL_TO_USDC', 'USDC_TO_SOL'].includes(body.side)) {
      return res.status(400).json({ error: 'side must be SOL_TO_USDC or USDC_TO_SOL' });
    }
    if (!body?.amount || body.amount <= 0) {
      return res.status(400).json({ error: 'amount must be > 0' });
    }

    const user = new PublicKey(body.userPubkey);
    const slippageBps = body.slippageBps ?? 50;

    const inputMint = body.side === 'SOL_TO_USDC' ? WSOL : USDC;
    const outputMint = body.side === 'SOL_TO_USDC' ? USDC : WSOL;

    const amountInSmallest =
      body.side === 'SOL_TO_USDC'
        ? Math.floor(body.amount * LAMPORTS_PER_SOL)
        : Math.floor(body.amount * 1_000_000);

    const quoteUrl = new URL('https://placeholder.local/v6/quote');
    quoteUrl.searchParams.set('inputMint', inputMint);
    quoteUrl.searchParams.set('outputMint', outputMint);
    quoteUrl.searchParams.set('amount', String(amountInSmallest));
    quoteUrl.searchParams.set('slippageBps', String(slippageBps));

    const quoteResult = await fetchJsonFromJupiter<JupiterQuoteResponse>({
      endpoints: ['/v6/quote', '/swap/v1/quote'],
      query: quoteUrl.searchParams,
      init: { method: 'GET' },
    });
    if (!quoteResult.ok) {
      return res.status(quoteResult.status).json({ error: quoteResult.error, details: quoteResult.details });
    }

    const quote = quoteResult.data;
    if (!quote || !quote.outAmount) {
      return res.status(400).json({ error: 'No Jupiter route found' });
    }

    const swapResult = await fetchJsonFromJupiter<JupiterSwapResponse>({
      endpoints: ['/v6/swap', '/swap/v1/swap'],
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: user.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
        }),
      },
    });

    if (!swapResult.ok) {
      return res.status(swapResult.status).json({ error: swapResult.error, details: swapResult.details });
    }

    const swapJson = swapResult.data;
    const swapTxB64 = swapJson.swapTransaction;
    if (!swapTxB64) {
      return res.status(502).json({ error: 'Missing swapTransaction from Jupiter' });
    }

    const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTxB64, 'base64'));

    const { alts, blockhash, lastValidBlockHeight } = await withRpcFallback(
      'lookup table and blockhash resolution',
      async (connection) => {
        const lookupTables = await fetchAltAccounts(connection, swapTx);
        const latest = await connection.getLatestBlockhash('confirmed');
        return {
          alts: lookupTables,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        };
      }
    );

    const decompiled = TransactionMessage.decompile(swapTx.message, {
      addressLookupTableAccounts: alts,
    });

    let feeLamports: number;
    if (body.side === 'SOL_TO_USDC') {
      feeLamports = feeLamportsFromSolAmount(body.amount);
    } else {
      const outLamports = Number(quote.outAmount);
      const outSol = outLamports / LAMPORTS_PER_SOL;
      feeLamports = feeLamportsFromSolAmount(outSol);
    }

    const feeIx = SystemProgram.transfer({
      fromPubkey: user,
      toPubkey: new PublicKey(feeWallet),
      lamports: feeLamports,
    });

    const newMsg = new TransactionMessage({
      payerKey: decompiled.payerKey,
      instructions: [...decompiled.instructions, feeIx],
      recentBlockhash: blockhash,
    }).compileToV0Message(alts);

    const finalTx = new VersionedTransaction(newMsg);
    const transactionBase64 = Buffer.from(finalTx.serialize()).toString('base64');

    return res.json({
      transactionBase64,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      feeLamports,
      quote: {
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        priceImpactPct: quote.priceImpactPct,
      },
    });
  } catch (error) {
    console.error('Jupiter swap-tx error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Swap build failed',
    });
  }
});

export default router;
