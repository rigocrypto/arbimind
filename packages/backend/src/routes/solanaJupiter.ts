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

const JUP_QUOTE = 'https://quote-api.jup.ag/v6/quote';
const JUP_SWAP = 'https://quote-api.jup.ag/v6/swap';

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
const rpc =
  process.env.SOLANA_JUPITER_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(rpc, 'confirmed');

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

    const quoteUrl = new URL(JUP_QUOTE);
    quoteUrl.searchParams.set('inputMint', inputMint);
    quoteUrl.searchParams.set('outputMint', outputMint);
    quoteUrl.searchParams.set('amount', String(amountInSmallest));
    quoteUrl.searchParams.set('slippageBps', String(slippageBps));

    const quoteRes = await fetch(quoteUrl.toString());
    if (!quoteRes.ok) {
      const txt = await quoteRes.text().catch(() => '');
      return res.status(502).json({ error: 'Jupiter quote failed', details: txt });
    }

    const quote = (await quoteRes.json()) as JupiterQuoteResponse;
    if (!quote || !quote.outAmount) {
      return res.status(400).json({ error: 'No Jupiter route found' });
    }

    const swapRes = await fetch(JUP_SWAP, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: user.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      }),
    });

    if (!swapRes.ok) {
      const txt = await swapRes.text().catch(() => '');
      return res.status(502).json({ error: 'Jupiter swap build failed', details: txt });
    }

    const swapJson = (await swapRes.json()) as JupiterSwapResponse;
    const swapTxB64 = swapJson.swapTransaction;
    if (!swapTxB64) {
      return res.status(502).json({ error: 'Missing swapTransaction from Jupiter' });
    }

    const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTxB64, 'base64'));

    const alts = await fetchAltAccounts(connection, swapTx);
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

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

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
