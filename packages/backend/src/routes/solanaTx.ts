import express, { Request, Response } from 'express';
import {
  Connection,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

function resolveSolanaRpc(): string {
  const url = process.env.SOLANA_RPC_URL?.trim();
  if (url) return url;
  const cluster = process.env.SOLANA_CLUSTER || 'devnet';
  if (cluster === 'mainnet-beta') return 'https://api.mainnet-beta.solana.com';
  if (cluster === 'testnet') return 'https://api.testnet.solana.com';
  return 'https://api.devnet.solana.com';
}

function parseFeeLamports(amountLamports: number): number {
  const pct = Number(process.env.SOLANA_FEE_PCT ?? '0.5');
  const minSol = Number(process.env.SOLANA_FEE_MIN_SOL ?? '0.001');
  const minLamports = Math.floor(minSol * LAMPORTS_PER_SOL);
  const pctLamports = Math.floor(amountLamports * (pct / 100));
  return Math.max(minLamports, pctLamports);
}

function isValidSolanaAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

const router = express.Router();
const connection = new Connection(resolveSolanaRpc(), 'confirmed');

/**
 * POST /api/solana/tx/transfer
 * Build unsigned SOL transfer tx (non-custodial). User signs + sends from UI.
 */
router.post('/transfer', async (req: Request, res: Response) => {
  try {
    const arbAccount = process.env.SOLANA_ARB_ACCOUNT?.trim();
    const feeWallet = process.env.SOLANA_FEE_WALLET?.trim();

    if (!arbAccount) {
      return res.status(500).json({ error: 'SOLANA_ARB_ACCOUNT not configured' });
    }
    if (!feeWallet) {
      return res.status(500).json({ error: 'SOLANA_FEE_WALLET not configured' });
    }

    const body = req.body as {
      fromPubkey?: string;
      destination?: 'arb' | 'external';
      toPubkey?: string;
      amountSol?: number;
    };

    if (!body?.fromPubkey || !isValidSolanaAddress(body.fromPubkey)) {
      return res.status(400).json({ error: 'fromPubkey required and must be valid Solana address' });
    }
    if (!body?.amountSol || body.amountSol <= 0) {
      return res.status(400).json({ error: 'amountSol must be > 0' });
    }
    if (!body?.destination || !['arb', 'external'].includes(body.destination)) {
      return res.status(400).json({ error: 'destination must be "arb" or "external"' });
    }

    const from = new PublicKey(body.fromPubkey);
    let recipient: PublicKey;

    if (body.destination === 'arb') {
      recipient = new PublicKey(arbAccount);
    } else {
      if (!body.toPubkey || !isValidSolanaAddress(body.toPubkey)) {
        return res.status(400).json({ error: 'toPubkey required for external destination' });
      }
      recipient = new PublicKey(body.toPubkey);
    }

    const amountLamports = Math.floor(body.amountSol * LAMPORTS_PER_SOL);
    const feeLamports = parseFeeLamports(amountLamports);

    if (amountLamports <= feeLamports) {
      return res.status(400).json({ error: 'amountSol too small relative to minimum fee' });
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const ixTransfer = SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: recipient,
      lamports: amountLamports,
    });

    const ixFee = SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: new PublicKey(feeWallet),
      lamports: feeLamports,
    });

    const msg = new TransactionMessage({
      payerKey: from,
      recentBlockhash: blockhash,
      instructions: [ixTransfer, ixFee],
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    const transactionBase64 = Buffer.from(tx.serialize()).toString('base64');

    return res.json({
      transactionBase64,
      recipient: recipient.toBase58(),
      amountLamports,
      feeLamports,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
    });
  } catch (error) {
    console.error('Solana tx/transfer error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Transfer build failed',
    });
  }
});

export default router;
