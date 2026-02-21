import express, { Request, Response } from 'express';
import {
  Connection,
  Keypair,
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

function parseTreasuryKeypair(): Keypair {
  const raw =
    process.env.SOLANA_TREASURY_SECRET_KEY?.trim() ||
    process.env.SOLANA_ARB_SECRET_KEY?.trim() ||
    '';

  if (!raw) {
    throw new Error('SOLANA_TREASURY_SECRET_KEY not configured');
  }

  try {
    if (raw.startsWith('[')) {
      const secret = Uint8Array.from(JSON.parse(raw) as number[]);
      return Keypair.fromSecretKey(secret);
    }

    const secret = Uint8Array.from(Buffer.from(raw, 'base64'));
    return Keypair.fromSecretKey(secret);
  } catch {
    throw new Error('SOLANA_TREASURY_SECRET_KEY must be a valid base64 key or JSON byte array');
  }
}

const router = express.Router();
const connection = new Connection(resolveSolanaRpc(), 'confirmed');

/**
 * GET /api/solana/tx/withdraw-capabilities
 * Returns whether treasury signer key is configured and parseable.
 */
router.get('/withdraw-capabilities', async (_req: Request, res: Response) => {
  try {
    const treasury = parseTreasuryKeypair();
    return res.json({
      hasTreasuryKey: true,
      treasuryPubkey: treasury.publicKey.toBase58(),
    });
  } catch {
    return res.json({
      hasTreasuryKey: false,
    });
  }
});

/**
 * GET /api/solana/tx/status/:sig
 * Returns signature lifecycle status for UI polling.
 */
router.get('/status/:sig', async (req: Request, res: Response) => {
  try {
    const sig = (req.params.sig || '').trim();
    if (!sig) {
      return res.status(400).json({ error: 'sig required' });
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(sig)) {
      return res.status(400).json({ error: 'sig must be a valid base58 Solana signature' });
    }

    const statusResp = await connection.getSignatureStatuses([sig], {
      searchTransactionHistory: true,
    });
    const status = statusResp.value[0];

    const cluster = process.env.SOLANA_CLUSTER || 'devnet';
    const suffix = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;

    return res.json({
      signature: sig,
      status: status?.confirmationStatus ?? 'unknown',
      confirmations: status?.confirmations ?? null,
      err: status?.err ?? null,
      explorer: `https://solscan.io/tx/${sig}${suffix}`,
    });
  } catch (error) {
    console.error('Solana tx/status error:', error);
    const msg = error instanceof Error ? error.message : '';
    if (/Invalid param|WrongSize/i.test(msg)) {
      return res.status(400).json({ error: 'Invalid Solana signature format' });
    }
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Status lookup failed',
    });
  }
});

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

/**
 * POST /api/solana/tx/withdraw
 * Custodial treasury withdrawal (treasury signs + sends).
 */
router.post('/withdraw', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      amountSol?: number;
      amount?: number;
      fromPubkey?: string;
      toPubkey?: string;
      to?: string;
    };

    const amountSol = Number(body.amountSol ?? body.amount);
    const toPubkey = (body.toPubkey ?? body.to ?? '').trim();

    if (!Number.isFinite(amountSol) || amountSol <= 0) {
      return res.status(400).json({ error: 'amountSol must be > 0' });
    }
    if (!toPubkey || !isValidSolanaAddress(toPubkey)) {
      return res.status(400).json({ error: 'toPubkey required and must be valid Solana address' });
    }

    const treasury = parseTreasuryKeypair();
    const treasuryPubkey = treasury.publicKey.toBase58();

    if (body.fromPubkey && body.fromPubkey !== treasuryPubkey) {
      return res.status(400).json({ error: 'fromPubkey does not match configured treasury signer' });
    }

    const amountLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    if (amountLamports <= 0) {
      return res.status(400).json({ error: 'amountSol too small' });
    }

    const to = new PublicKey(toPubkey);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const ixWithdraw = SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: to,
      lamports: amountLamports,
    });

    const msg = new TransactionMessage({
      payerKey: treasury.publicKey,
      recentBlockhash: blockhash,
      instructions: [ixWithdraw],
    }).compileToV0Message();

    const tx = new VersionedTransaction(msg);
    tx.sign([treasury]);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });

    const cluster = process.env.SOLANA_CLUSTER || 'devnet';
    const suffix = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;

    return res.json({
      txSig: signature,
      signature,
      fromPubkey: treasuryPubkey,
      toPubkey: to.toBase58(),
      amountLamports,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      explorer: `https://solscan.io/tx/${signature}${suffix}`,
    });
  } catch (error) {
    console.error('Solana tx/withdraw error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Withdraw failed',
    });
  }
});

export default router;
