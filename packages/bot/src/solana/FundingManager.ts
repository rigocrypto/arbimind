/**
 * FundingManager — deposit-to-trade auto-funding flow
 *
 * Step 1: wallet balance snapshotting (SOL / USDC / USDT), reserve math,
 *         available trading capital, trading gate.
 * Step 2: actual swap execution — SOL excess → USDC, USDT → USDC normalization
 *         via Jupiter, with cooldown + cost gate + one-swap-per-tick policy.
 */

import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
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

interface JupiterQuoteResponse {
  outAmount?: string;
  otherAmountThreshold?: string;
  priceImpactPct?: string;
  routePlan?: unknown[];
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
   * Called once per scanner tick. Reads balances, checks rebalance
   * conditions, executes at most one swap per tick.
   *
   * Execution order:
   *  1. Take snapshot
   *  2. Cooldown check
   *  3. SOL excess → base asset (highest priority)
   *  4. Non-base stable normalization (USDT → USDC or vice versa)
   *  5. Post-swap snapshot refresh
   *  6. Update lastRebalanceAt (only on success)
   */
  async checkAndRebalance(connection: Connection, wallet: Keypair): Promise<RebalanceResult> {
    const walletPubkey = wallet.publicKey;
    const snapshot = await this.takeSnapshot(connection, walletPubkey);
    this.logSnapshot(snapshot, walletPubkey);

    // ── Cooldown gate ──────────────────────────────────────────
    const now = Date.now();
    if (this.lastRebalanceAtMs > 0 && now - this.lastRebalanceAtMs < this.config.rebalanceCooldownMs) {
      return { triggered: false, reason: 'cooldown' };
    }

    // ── Case 1: SOL excess → base asset ────────────────────────
    if (snapshot.solExcessVsTarget > 0) {
      const excessUsd = snapshot.solExcessVsTarget * snapshot.solPriceUsd;
      if (excessUsd < this.config.minRebalanceUsd) {
        return { triggered: false, reason: 'below_min_usd' };
      }
      if (snapshot.solPriceUsd <= 0) {
        return { triggered: false, reason: 'no_sol_price' };
      }

      const inputAmountRaw = Math.floor(snapshot.solExcessVsTarget * 1e9); // lamports
      return this.attemptSwap({
        connection,
        wallet,
        inputMint: WRAPPED_SOL_MINT,
        outputMint: this.config.baseAssetMint,
        amountRaw: inputAmountRaw,
        estimatedUsd: excessUsd,
        successReason: 'sol_excess_swapped',
        label: 'SOL→' + this.config.baseAsset,
      });
    }

    // ── Case 2: Non-base stable normalization ──────────────────
    const nonBaseMint = this.config.baseAsset === 'USDC' ? MINT_USDT : MINT_USDC;
    const nonBaseBalance = this.config.baseAsset === 'USDC'
      ? snapshot.usdtBalance
      : snapshot.usdcBalance;

    if (nonBaseBalance >= this.config.minRebalanceUsd) {
      const decimals = MINT_DECIMALS[nonBaseMint] ?? 6;
      const amountRaw = Math.floor(nonBaseBalance * 10 ** decimals);
      const nonBaseSymbol = this.config.baseAsset === 'USDC' ? 'USDT' : 'USDC';

      return this.attemptSwap({
        connection,
        wallet,
        inputMint: nonBaseMint,
        outputMint: this.config.baseAssetMint,
        amountRaw,
        estimatedUsd: nonBaseBalance,
        successReason: nonBaseSymbol.toLowerCase() + '_normalized',
        label: nonBaseSymbol + '→' + this.config.baseAsset,
      });
    }

    // ── Nothing to rebalance ──────────────────────────────────
    return { triggered: false, reason: 'no_action_needed' };
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

  // ── Swap execution ─────────────────────────────────────────────

  private async attemptSwap(opts: {
    connection: Connection;
    wallet: Keypair;
    inputMint: string;
    outputMint: string;
    amountRaw: number;
    estimatedUsd: number;
    successReason: string;
    label: string;
  }): Promise<RebalanceResult> {
    const { connection, wallet, inputMint, outputMint, amountRaw, estimatedUsd, successReason, label } = opts;
    const walletPubkey = wallet.publicKey;

    // 1. Get Jupiter quote
    let quoteResponse: JupiterQuoteResponse;
    try {
      quoteResponse = await this.getJupiterQuote(inputMint, outputMint, amountRaw);
    } catch (err) {
      const result: RebalanceResult = {
        triggered: true,
        reason: 'swap_failed',
        error: err instanceof Error ? err.message : String(err),
      };
      this.emitRebalanceLog(label, estimatedUsd, 0, result);
      return result;
    }

    // 2. Cost gate — estimate fee in BPS
    const outAmount = Number(quoteResponse.outAmount || '0');
    const otherThreshold = Number(
      (quoteResponse as Record<string, unknown>)['otherAmountThreshold'] ?? outAmount,
    );
    const slippageCostRaw = outAmount > 0 && otherThreshold < outAmount
      ? outAmount - otherThreshold
      : 0;
    // Approximate slippage cost in USD (stables ≈ $1 per unit at 6 decimals)
    const outputDecimals = MINT_DECIMALS[outputMint] ?? 6;
    const slippageCostUsd = slippageCostRaw / 10 ** outputDecimals;
    // Estimate tx fee: ~5000 lamports base + 5000 priority (rebalance = low priority)
    const estFeeLamports = 10_000;
    const solPrice = this.lastSnapshot?.solPriceUsd ?? 0;
    const txCostUsd = solPrice > 0 ? (estFeeLamports / 1e9) * solPrice : 0;
    const totalCostUsd = slippageCostUsd + txCostUsd;
    const costBps = estimatedUsd > 0
      ? Math.round((totalCostUsd / estimatedUsd) * 10_000)
      : 0;

    if (costBps > this.config.maxRebalanceCostBps) {
      const result: RebalanceResult = {
        triggered: false,
        reason: 'too_expensive',
        details: { costBps, maxAllowedBps: this.config.maxRebalanceCostBps, totalCostUsd },
      };
      this.emitRebalanceLog(label, estimatedUsd, 0, result);
      return result;
    }

    // 3. Execute swap
    let signature: string;
    try {
      signature = await this.executeJupiterSwap(connection, wallet, quoteResponse);
    } catch (err) {
      // Do NOT update lastRebalanceAtMs — next tick should retry
      const result: RebalanceResult = {
        triggered: true,
        reason: 'swap_failed',
        error: err instanceof Error ? err.message : String(err),
      };
      this.emitRebalanceLog(label, estimatedUsd, 0, result);
      return result;
    }

    // 4. Post-swap snapshot refresh
    const postSnapshot = await this.takeSnapshot(connection, walletPubkey);

    // 5. Update cooldown (success only)
    this.lastRebalanceAtMs = Date.now();

    const newCapitalUsd = postSnapshot.availableTradeCapitalUsd;
    const result: RebalanceResult = {
      triggered: true,
      reason: successReason,
      details: {
        signature,
        inputMint,
        outputMint,
        amountRaw,
        estimatedUsd,
        costBps,
        newCapitalUsd,
      },
    };
    this.emitRebalanceLog(label, estimatedUsd, newCapitalUsd, result);
    return result;
  }

  private async getJupiterQuote(
    inputMint: string,
    outputMint: string,
    amountRaw: number,
  ): Promise<JupiterQuoteResponse> {
    const url = new URL(`${this.config.jupiterBaseUrl}/quote`);
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', String(amountRaw));
    url.searchParams.set('slippageBps', '50');

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      throw new Error(`Jupiter quote HTTP ${resp.status}`);
    }
    return (await resp.json()) as JupiterQuoteResponse;
  }

  private async executeJupiterSwap(
    connection: Connection,
    wallet: Keypair,
    quoteResponse: JupiterQuoteResponse,
  ): Promise<string> {
    const swapResp = await fetch(`${this.config.jupiterBaseUrl}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 5000,
            priorityLevel: 'low',
          },
        },
        asLegacyTransaction: true,
      }),
    });

    if (!swapResp.ok) {
      const body = await swapResp.text().catch(() => '');
      throw new Error(`Jupiter swap HTTP ${swapResp.status}: ${body.slice(0, 200)}`);
    }

    const swapBody = (await swapResp.json()) as { swapTransaction?: string };
    if (!swapBody.swapTransaction) {
      throw new Error('Jupiter swap response missing swapTransaction');
    }

    // Deserialize, sign, and send
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(swapBody.swapTransaction, 'base64'),
    );
    transaction.sign([wallet]);

    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 2,
    });

    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    if (confirmation.value.err) {
      throw new Error(`swap confirmed with error: ${JSON.stringify(confirmation.value.err)}`);
    }

    return signature;
  }

  // ── Internal helpers ───────────────────────────────────────────

  private logSnapshot(snapshot: WalletSnapshot, walletPubkey?: PublicKey): void {
    this.logger.info('[FUNDING] wallet_snapshot', {
      wallet: walletPubkey?.toBase58() ?? 'unknown',
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

  private emitRebalanceLog(
    label: string,
    estimatedUsd: number,
    newCapitalUsd: number,
    result: RebalanceResult,
  ): void {
    this.logger.info('[FUNDING] funding_rebalance', {
      event: 'funding_rebalance',
      label,
      triggered: result.triggered,
      reason: result.reason,
      estimatedUsd: +estimatedUsd.toFixed(2),
      newCapitalUsd: +newCapitalUsd.toFixed(2),
      ...(result.details ?? {}),
      ...(result.error ? { error: result.error } : {}),
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
