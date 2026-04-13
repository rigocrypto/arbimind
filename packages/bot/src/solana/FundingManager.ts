/**
 * FundingManager — deposit-to-trade auto-funding flow (Step 1: balance reading + WalletSnapshot logging)
 *
 * Reads SOL, USDC, USDT balances every scanner tick, enforces SOL reserve policy,
 * and exposes available trading capital. Swap/normalization logic will be added
 * in a later step once live balance logging is validated.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { Logger } from '../utils/Logger';

// ── Constants ────────────────────────────────────────────────────
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

const SUPPORTED_MINTS = new Set([MINT_USDC, MINT_USDT]);

const MINT_DECIMALS: Record<string, number> = {
  [WRAPPED_SOL_MINT]: 9,
  [MINT_USDC]: 6,
  [MINT_USDT]: 6,
};

// ── Types ────────────────────────────────────────────────────────

export interface FundingManagerConfig {
  /** Target SOL reserve (above this, excess is swept to base) */
  targetSolReserve: number;
  /** Minimum SOL reserve (below this, trading is blocked) */
  minSolReserve: number;
  /** Base asset mint (USDC by default) */
  baseAssetMint: string;
  /** Base asset symbol */
  baseAsset: 'USDC' | 'USDT';
  /** Minimum swap amount in USD to trigger a rebalance */
  minRebalanceUsd: number;
  /** Maximum cost in BPS for a rebalance swap */
  maxRebalanceCostBps: number;
  /** Cooldown between rebalance swaps in ms */
  rebalanceCooldownMs: number;
  /** Jupiter API base URL */
  jupiterBaseUrl: string;
}

export interface WalletSnapshot {
  /** Timestamp of the snapshot */
  timestampMs: number;
  /** Native SOL balance (human-readable) */
  solBalance: number;
  /** USDC balance (human-readable) */
  usdcBalance: number;
  /** USDT balance (human-readable) */
  usdtBalance: number;
  /** SOL price in USD (from Jupiter quote) */
  solPriceUsd: number;
  /** SOL excess above targetSolReserve (0 if at/below target) */
  solExcessVsTarget: number;
  /** SOL deficit below minSolReserve (0 if at/above min) */
  solDeficitVsMin: number;
  /** Available trading capital in USD = baseAsset balance only */
  availableTradeCapitalUsd: number;
  /** Whether trading is blocked due to low SOL or low capital */
  tradingBlocked: boolean;
  /** Reason trading is blocked (null if not blocked) */
  blockReason: string | null;
}

export interface RebalanceResult {
  /** Whether a rebalance swap was triggered */
  triggered: boolean;
  /** Reason for the trigger (or skip) */
  reason: string;
  /** Details of the swap if triggered */
  details?: Record<string, unknown>;
  /** Error message if the swap failed */
  error?: string;
}

// ── FundingManager ───────────────────────────────────────────────

export class FundingManager {
  private readonly logger = new Logger('FundingManager');
  private readonly config: FundingManagerConfig;
  private lastSnapshot: WalletSnapshot | null = null;
  private lastRebalanceAtMs = 0;

  constructor(config: FundingManagerConfig) {
    this.config = config;
    this.logger.info('[FUNDING] initialized', {
      baseAsset: config.baseAsset,
      baseAssetMint: config.baseAssetMint,
      targetSolReserve: config.targetSolReserve,
      minSolReserve: config.minSolReserve,
      minRebalanceUsd: config.minRebalanceUsd,
      maxRebalanceCostBps: config.maxRebalanceCostBps,
      rebalanceCooldownMs: config.rebalanceCooldownMs,
    });
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Called once per scanner tick. Reads balances, logs snapshot,
   * and (in a future step) runs rebalance if needed.
   *
   * Returns a RebalanceResult indicating what happened.
   */
  async checkAndRebalance(connection: Connection, walletPubkey: PublicKey): Promise<RebalanceResult> {
    const snapshot = await this.takeSnapshot(connection, walletPubkey);
    this.logSnapshot(snapshot);

    // Step 1: no swap logic — just snapshot + log
    return { triggered: false, reason: 'step1_snapshot_only' };
  }

  /**
   * Read current wallet balances and compute the WalletSnapshot.
   */
  async takeSnapshot(connection: Connection, walletPubkey: PublicKey): Promise<WalletSnapshot> {
    // 1. Native SOL balance
    const lamports = await connection.getBalance(walletPubkey);
    const solBalance = lamports / 1e9;

    // 2. SPL token balances
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    });

    let usdcBalance = 0;
    let usdtBalance = 0;

    for (const account of tokenAccounts.value) {
      const parsed = account.account.data.parsed as {
        info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } };
      };
      const mint = parsed.info?.mint;
      const tokenAmount = parsed.info?.tokenAmount;
      if (!mint || !tokenAmount) continue;

      const rawAmount = Number(tokenAmount.amount || '0');
      if (rawAmount === 0) continue;

      if (!SUPPORTED_MINTS.has(mint)) continue;

      const decimals = tokenAmount.decimals ?? MINT_DECIMALS[mint] ?? 6;
      const humanAmount = rawAmount / 10 ** decimals;

      if (mint === MINT_USDC) {
        usdcBalance += humanAmount;
      } else if (mint === MINT_USDT) {
        usdtBalance += humanAmount;
      }
    }

    // 3. SOL price (via Jupiter 1-SOL → USDC quote)
    const solPriceUsd = await this.fetchSolPriceUsd();

    // 4. Compute reserve numbers
    const solExcessVsTarget = Math.max(0, solBalance - this.config.targetSolReserve);
    const solDeficitVsMin = Math.max(0, this.config.minSolReserve - solBalance);

    // 5. Available trading capital = base asset balance only (stables ≈ $1)
    const baseBalance = this.config.baseAsset === 'USDC' ? usdcBalance : usdtBalance;
    const availableTradeCapitalUsd = baseBalance;

    // 6. Trading gate
    let tradingBlocked = false;
    let blockReason: string | null = null;

    if (solDeficitVsMin > 0) {
      tradingBlocked = true;
      blockReason = `SOL below min reserve: ${solBalance.toFixed(4)} < ${this.config.minSolReserve}`;
    } else if (availableTradeCapitalUsd < 1) {
      tradingBlocked = true;
      blockReason = `base asset too low: $${availableTradeCapitalUsd.toFixed(2)}`;
    }

    const snapshot: WalletSnapshot = {
      timestampMs: Date.now(),
      solBalance,
      usdcBalance,
      usdtBalance,
      solPriceUsd,
      solExcessVsTarget,
      solDeficitVsMin,
      availableTradeCapitalUsd,
      tradingBlocked,
      blockReason,
    };

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Get the most recent WalletSnapshot (null if never taken).
   */
  getWalletSnapshot(): WalletSnapshot | null {
    return this.lastSnapshot;
  }

  /**
   * Get available trading capital from the last snapshot.
   */
  getAvailableCapitalUsd(): number {
    return this.lastSnapshot?.availableTradeCapitalUsd ?? 0;
  }

  /**
   * Whether trading is currently blocked.
   */
  isTradingBlocked(): boolean {
    return this.lastSnapshot?.tradingBlocked ?? true;
  }

  // ── Internal helpers ───────────────────────────────────────────

  private logSnapshot(snapshot: WalletSnapshot): void {
    this.logger.info('[FUNDING] wallet_snapshot', {
      solBalance: +snapshot.solBalance.toFixed(4),
      usdcBalance: +snapshot.usdcBalance.toFixed(2),
      usdtBalance: +snapshot.usdtBalance.toFixed(2),
      solPriceUsd: +snapshot.solPriceUsd.toFixed(2),
      solExcessVsTarget: +snapshot.solExcessVsTarget.toFixed(4),
      solDeficitVsMin: +snapshot.solDeficitVsMin.toFixed(4),
      availableTradeCapitalUsd: +snapshot.availableTradeCapitalUsd.toFixed(2),
      tradingBlocked: snapshot.tradingBlocked,
      blockReason: snapshot.blockReason,
    });
  }

  private async fetchSolPriceUsd(): Promise<number> {
    try {
      const url = new URL(`${this.config.jupiterBaseUrl}/quote`);
      url.searchParams.set('inputMint', WRAPPED_SOL_MINT);
      url.searchParams.set('outputMint', MINT_USDC);
      url.searchParams.set('amount', '1000000000'); // 1 SOL
      url.searchParams.set('slippageBps', '50');

      const response = await fetch(url.toString());
      if (!response.ok) {
        this.logger.warn('[FUNDING] SOL price fetch failed', { status: response.status });
        return 0;
      }

      const quote = (await response.json()) as { outAmount?: string };
      const outAmount = Number(quote.outAmount || '0');
      if (!Number.isFinite(outAmount) || outAmount <= 0) return 0;
      return outAmount / 1e6; // USDC has 6 decimals
    } catch (err) {
      this.logger.warn('[FUNDING] SOL price fetch error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }
}
