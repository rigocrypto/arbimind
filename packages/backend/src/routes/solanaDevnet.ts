import express, { Request, Response, Router } from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';

const router: Router = express.Router();

// ─── Devnet Connection (with fallback) ──────────────────────────────
const DEVNET_RPCS = [
  process.env.SOLANA_RPC_URL_DEVNET?.trim(),
  'https://api.devnet.solana.com',
].filter(Boolean) as string[];

const connectionCache = new Map<string, Connection>();

function getDevnetConnection(): Connection {
  const url = DEVNET_RPCS[0] ?? 'https://api.devnet.solana.com';
  const cached = connectionCache.get(url);
  if (cached) return cached;
  const conn = new Connection(url, 'confirmed');
  connectionCache.set(url, conn);
  return conn;
}

async function withFallback<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  for (let i = 0; i < DEVNET_RPCS.length; i++) {
    try {
      const url = DEVNET_RPCS[i]!;
      let conn = connectionCache.get(url);
      if (!conn) {
        conn = new Connection(url, 'confirmed');
        connectionCache.set(url, conn);
      }
      return await fn(conn);
    } catch (err) {
      if (i === DEVNET_RPCS.length - 1) throw err;
    }
  }
  throw new Error('All devnet RPCs failed');
}

// ─── Validation ─────────────────────────────────────────────────────
function isValidSolanaAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

const TREASURY_PUBKEY =
  process.env.SOLANA_ARB_ACCOUNT?.trim() ||
  process.env.SOLANA_TREASURY_ADDRESS?.trim() ||
  '';

// Devnet USDC mints (multiple devnet tokens exist)
const DEVNET_USDC_MINTS = new Set([
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // common devnet USDC
  'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', // another devnet USDC
]);

// ─── Balance cache (5s TTL) ─────────────────────────────────────────
interface CachedBalance {
  solBalance: number;
  usdcBalance: number;
  fetchedAt: number;
}
const balanceCache = new Map<string, CachedBalance>();
const BALANCE_CACHE_TTL_MS = 5_000;

async function fetchBalance(
  address: string,
  conn: Connection,
): Promise<{ solBalance: number; usdcBalance: number }> {
  const now = Date.now();
  const cached = balanceCache.get(address);
  if (cached && now - cached.fetchedAt < BALANCE_CACHE_TTL_MS) {
    return { solBalance: cached.solBalance, usdcBalance: cached.usdcBalance };
  }

  const pubkey = new PublicKey(address);
  const [lamports, tokenAccounts] = await Promise.all([
    conn.getBalance(pubkey),
    conn.getParsedTokenAccountsByOwner(pubkey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    }),
  ]);

  const solBalance = lamports / LAMPORTS_PER_SOL;
  let usdcBalance = 0;
  for (const ta of tokenAccounts.value) {
    const info = ta.account.data.parsed.info as {
      mint: string;
      tokenAmount: { uiAmount: number | null };
    };
    if (DEVNET_USDC_MINTS.has(info.mint) && info.tokenAmount.uiAmount) {
      usdcBalance += info.tokenAmount.uiAmount;
    }
  }

  balanceCache.set(address, { solBalance, usdcBalance, fetchedAt: now });
  return { solBalance, usdcBalance };
}

// ─── Airdrop rate limiter (30s per wallet) ──────────────────────────
const airdropTimestamps = new Map<string, number>();
const AIRDROP_COOLDOWN_MS = 30_000;
const MAX_AIRDROP_SOL = 2;
const AIRDROP_RETRY_COUNT = 2;
const AIRDROP_RETRY_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── GET /api/solana/devnet-balances ────────────────────────────────
router.get('/devnet-balances', async (req: Request, res: Response) => {
  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet.trim() : '';
  if (!wallet || !isValidSolanaAddress(wallet)) {
    return res.status(400).json({ error: 'Missing or invalid wallet parameter' });
  }

  if (!TREASURY_PUBKEY || !isValidSolanaAddress(TREASURY_PUBKEY)) {
    return res.status(503).json({ error: 'Treasury address not configured' });
  }

  try {
    const result = await withFallback(async (conn) => {
      const [userBal, arbBal, slot] = await Promise.all([
        fetchBalance(wallet, conn),
        fetchBalance(TREASURY_PUBKEY, conn),
        conn.getSlot(),
      ]);
      return { userBal, arbBal, slot };
    });

    return res.json({
      userWallet: {
        address: wallet,
        solBalance: result.userBal.solBalance,
        usdcBalance: result.userBal.usdcBalance,
      },
      arbAccount: {
        address: TREASURY_PUBKEY,
        solBalance: result.arbBal.solBalance,
        usdcBalance: result.arbBal.usdcBalance,
      },
      network: 'devnet',
      slot: result.slot,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'RPC request failed';
    console.error('[DEVNET_BALANCES] error:', msg);
    return res.status(503).json({ error: 'Devnet RPC unavailable — retry in a moment', detail: msg });
  }
});

// ─── POST /api/solana/devnet-airdrop ────────────────────────────────
router.post('/devnet-airdrop', async (req: Request, res: Response) => {
  const { wallet, amount } = req.body as { wallet?: string; amount?: number };

  if (!wallet || !isValidSolanaAddress(wallet)) {
    return res.status(400).json({ success: false, error: 'invalid wallet' });
  }

  const solAmount = typeof amount === 'number' ? amount : 1;
  if (solAmount <= 0 || solAmount > MAX_AIRDROP_SOL) {
    return res.status(400).json({
      success: false,
      error: `Amount must be between 0 and ${MAX_AIRDROP_SOL} SOL`,
    });
  }

  // Rate limit check
  const lastAirdrop = airdropTimestamps.get(wallet) ?? 0;
  const elapsed = Date.now() - lastAirdrop;
  if (elapsed < AIRDROP_COOLDOWN_MS) {
    const retryAfterSec = Math.ceil((AIRDROP_COOLDOWN_MS - elapsed) / 1000);
    return res.status(429).json({
      success: false,
      error: 'rate limited',
      retryAfterSec,
    });
  }

  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);
  const pubkey = new PublicKey(wallet);

  let lastError: string = 'airdrop failed';
  for (let attempt = 0; attempt <= AIRDROP_RETRY_COUNT; attempt++) {
    try {
      const conn = getDevnetConnection();
      const signature = await conn.requestAirdrop(pubkey, lamports);
      await conn.confirmTransaction(signature, 'confirmed');

      airdropTimestamps.set(wallet, Date.now());
      // Invalidate balance cache
      balanceCache.delete(wallet);

      const newLamports = await conn.getBalance(pubkey);
      const newBalance = newLamports / LAMPORTS_PER_SOL;

      console.log(
        `[AIRDROP] wallet=${wallet.slice(0, 8)}… amount=${solAmount} SOL result=ok sig=${signature.slice(0, 16)}…`,
      );

      return res.json({ success: true, signature, newBalance });
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'airdrop failed';
      if (attempt < AIRDROP_RETRY_COUNT) {
        await sleep(AIRDROP_RETRY_DELAY_MS);
      }
    }
  }

  console.log(`[AIRDROP] wallet=${wallet.slice(0, 8)}… amount=${solAmount} SOL result=fail error=${lastError}`);
  return res.status(502).json({ success: false, error: lastError });
});

// ─── POST /api/solana/devnet-transfer ───────────────────────────────
router.post('/devnet-transfer', async (req: Request, res: Response) => {
  const { fromWallet, toWallet, amountSol, signedTx } = req.body as {
    fromWallet?: string;
    toWallet?: string;
    amountSol?: number;
    signedTx?: string;
  };

  if (!fromWallet || !isValidSolanaAddress(fromWallet)) {
    return res.status(400).json({ success: false, error: 'Invalid fromWallet address' });
  }
  if (!toWallet || !isValidSolanaAddress(toWallet)) {
    return res.status(400).json({ success: false, error: 'Invalid toWallet address' });
  }
  if (typeof amountSol !== 'number' || amountSol <= 0 || amountSol > 10) {
    return res.status(400).json({ success: false, error: 'amountSol must be between 0 and 10' });
  }
  if (!signedTx || typeof signedTx !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing signedTx (base64)' });
  }

  try {
    const conn = getDevnetConnection();

    const txBuffer = Buffer.from(signedTx, 'base64');
    const decoded = VersionedTransaction.deserialize(txBuffer);

    // Simulate first to catch errors early
    const simResult = await conn.simulateTransaction(decoded, { sigVerify: false });
    if (simResult.value.err) {
      const errStr = JSON.stringify(simResult.value.err);
      const isRentError = errStr.includes('InsufficientFundsForRent');
      const isBalanceError = errStr.includes('InsufficientFunds');
      return res.status(400).json({
        success: false,
        error: isRentError
          ? 'Insufficient funds — keep at least 0.01 SOL for rent/fees'
          : isBalanceError
            ? 'Insufficient balance for this transfer'
            : 'Transaction simulation failed',
        detail: errStr,
      });
    }

    const signature = await conn.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      maxRetries: 3,
    });
    await conn.confirmTransaction(signature, 'confirmed');

    // Invalidate caches
    balanceCache.delete(fromWallet);
    balanceCache.delete(toWallet);

    const [fromLamports, toLamports] = await Promise.all([
      conn.getBalance(new PublicKey(fromWallet)),
      conn.getBalance(new PublicKey(toWallet)),
    ]);

    console.log(
      `[TRANSFER] from=${fromWallet.slice(0, 8)}… to=${toWallet.slice(0, 8)}… amount=${amountSol} SOL sig=${signature.slice(0, 16)}…`,
    );

    return res.json({
      success: true,
      signature,
      newBalances: {
        from: fromLamports / LAMPORTS_PER_SOL,
        to: toLamports / LAMPORTS_PER_SOL,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Transfer failed';
    console.error('[DEVNET_TRANSFER] error:', msg);
    return res.status(502).json({ success: false, error: msg });
  }
});

export default router;
