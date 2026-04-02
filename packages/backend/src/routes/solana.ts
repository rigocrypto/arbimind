import express, { Request, Response, Router } from 'express';
import { PublicKey } from '@solana/web3.js';
import solanaTxRouter, { getConnection, getRequestCluster } from './solanaTx';
import solanaJupiterRouter from './solanaJupiter';
import { adminStore } from '../store/adminStore';

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const router: Router = express.Router();
router.use('/tx', solanaTxRouter);
router.use('/jupiter', solanaJupiterRouter);

const LAMPORTS_PER_SOL = 1e9;
const FEE_RATE = 0.005; // 0.5%

function formatRelativeTime(timestamp: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

/**
 * GET /api/solana/trades
 * Public read-only endpoint for recent normalized bot trades.
 */
router.get('/trades', (_req: Request, res: Response) => {
  try {
    const recent = adminStore.getTxs().slice(0, 20);

    const trades = recent.map((tx, index) => {
      const inferredVolumeSol = Math.max(Math.abs(tx.grossProfit), Math.abs(tx.netProfit)) * 20;
      const pair =
        tx.strategy === 'market-making'
          ? 'RAY/SOL'
          : tx.strategy === 'trend'
            ? 'JUP/SOL'
            : 'SOL/USDC';

      return {
        id: tx.id,
        pair,
        side: tx.blockNumber % 2 === 0 ? 'buy' : 'sell',
        volumeSol: Number(inferredVolumeSol.toFixed(4)),
        pnlSol: Number(tx.netProfit.toFixed(4)),
        status: tx.status === 'failed' ? 'failed' : 'success',
        at: formatRelativeTime(tx.time),
        timestamp: tx.time,
        hash: tx.hash,
        rank: index,
      };
    });

    return res.json({
      success: true,
      source: 'adminStore',
      count: trades.length,
      trades,
      generatedAt: Date.now(),
    });
  } catch (error) {
    console.error('Solana trades route error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch trades' });
  }
});

/**
 * POST /api/solana/:action
 * Stub for buy | sell | transfer. Simulates fee calculation.
 */
router.post('/:action', (req: Request, res: Response) => {
  try {
    const { action } = req.params as { action: 'buy' | 'sell' | 'transfer' };
    const { amount = 1, arbAccount } = req.body || {};

    const validActions = ['buy', 'sell', 'transfer'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, error: `Invalid action: ${action}` });
    }

    const amountNum = typeof amount === 'number' ? amount : parseFloat(amount) || 1;
    const feeSol = amountNum * FEE_RATE;
    const feeLamports = feeSol * LAMPORTS_PER_SOL;

    // Mock tx sig
    const mockSig = `FakeTx${Date.now().toString(36)}...`;

    return res.json({
      success: true,
      sig: mockSig,
      feeCharged: feeSol,
      feeLamports: Math.round(feeLamports),
      message: `Solana ${action}: ${amountNum} SOL → Arb: ${arbAccount || 'default'} (Fee: ${feeSol.toFixed(4)} SOL)`,
    });
  } catch (error) {
    console.error('Solana route error:', error);
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ─── RPC Proxy Endpoints ────────────────────────────────────────────
// These proxy browser-side Solana RPC calls through the backend to
// avoid CORS issues and keep API keys server-side only.

function isValidSolanaAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

/**
 * GET /api/solana/balance?address=<pubkey>&cluster=<cluster>
 * Returns SOL balance for the given address.
 */
router.get('/balance', async (req: Request, res: Response) => {
  const address = typeof req.query.address === 'string' ? req.query.address.trim() : '';
  if (!address || !isValidSolanaAddress(address)) {
    return res.status(400).json({ error: 'Missing or invalid address parameter' });
  }

  try {
    const cluster = getRequestCluster(req);
    const connection = getConnection(cluster);
    const pubkey = new PublicKey(address);
    const lamports = await connection.getBalance(pubkey);

    return res.json({
      address,
      lamports,
      sol: lamports / LAMPORTS_PER_SOL,
    });
  } catch (err) {
    console.error('[solana-proxy] balance error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'RPC request failed' });
  }
});

/**
 * GET /api/solana/token-accounts?address=<pubkey>&cluster=<cluster>
 * Returns parsed SPL token accounts for the given address.
 */
router.get('/token-accounts', async (req: Request, res: Response) => {
  const address = typeof req.query.address === 'string' ? req.query.address.trim() : '';
  if (!address || !isValidSolanaAddress(address)) {
    return res.status(400).json({ error: 'Missing or invalid address parameter' });
  }

  try {
    const cluster = getRequestCluster(req);
    const connection = getConnection(cluster);
    const pubkey = new PublicKey(address);

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_PROGRAM_ID,
    });

    const accounts = tokenAccounts.value.map((ta) => {
      const info = ta.account.data.parsed.info as {
        mint: string;
        tokenAmount: { uiAmountString: string; decimals: number };
      };
      return {
        mint: info.mint,
        amount: info.tokenAmount.uiAmountString,
        decimals: info.tokenAmount.decimals,
      };
    });

    return res.json({ address, accounts });
  } catch (err) {
    console.error('[solana-proxy] token-accounts error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'RPC request failed' });
  }
});

export default router;
