/**
 * SolanaInventoryManager
 *
 * Manages wallet inventory for the Solana arb bot:
 * - periodic balance scans (SOL, USDC, USDT)
 * - SOL reserve enforcement (min/target)
 * - auto-rebalance excess deposits into the configured base asset
 * - available trading capital computation
 * - position sizing (fraction / min / max) with profit compounding
 * - funding lock to prevent conflicts with active trade execution
 */

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import { Logger } from '../utils/Logger';
import type { InventoryConfig } from './config';

// ── Mint constants ────────────────────────────────────────────────
const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112';
const MINT_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const MINT_USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

const SUPPORTED_MINTS = new Set([WRAPPED_SOL_MINT, MINT_USDC, MINT_USDT]);

const MINT_DECIMALS: Record<string, number> = {
  [WRAPPED_SOL_MINT]: 9,
  [MINT_USDC]: 6,
  [MINT_USDT]: 6,
};

const MINT_SYMBOL: Record<string, string> = {
  [WRAPPED_SOL_MINT]: 'SOL',
  [MINT_USDC]: 'USDC',
  [MINT_USDT]: 'USDT',
};

// ── Types ─────────────────────────────────────────────────────────
export interface InventorySnapshot {
  solBalance: number;
  solReserveDeficit: number;
  solReserveExcess: number;
  baseAssetBalance: number;
  baseAssetMint: string;
  baseAssetSymbol: string;
  nonBaseStableBalance: number;
  nonBaseStableMint: string | null;
  unsupportedTokens: Array<{ mint: string; rawAmount: number }>;
  availableTradingCapitalUsd: number;
  recommendedTradeSizeUsd: number;
  tradingBlocked: boolean;
  blockReason: string | null;
  solPriceUsd: number;
  timestampMs: number;
}

interface RebalanceDecision {
  action: 'swap_sol_to_base' | 'swap_stable_to_base' | 'swap_base_to_sol' | 'none';
  reason: string;
  inputMint: string;
  outputMint: string;
  amountRaw: number;
  estimatedUsd: number;
}

interface JupiterQuoteResponse {
  outAmount: string;
  priceImpactPct: string;
  routePlan: unknown[];
  [key: string]: unknown;
}

// ── Manager ───────────────────────────────────────────────────────
export class SolanaInventoryManager {
  private readonly logger = new Logger('SolanaInventoryManager');
  private readonly config: InventoryConfig;
  private readonly jupiterBaseUrl: string;
  private readonly maxSlippageBps: number;
  private readonly asLegacyTransaction: boolean;
  private readonly priorityFeeLamports: number;

  private lastSnapshot: InventorySnapshot | null = null;
  private lastRebalanceAtMs = 0;
  private cumulativeRealizedPnlUsd = 0;
  private locked = false;
  private rebalanceTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: {
    config: InventoryConfig;
    jupiterBaseUrl: string;
    maxSlippageBps: number;
    asLegacyTransaction: boolean;
    priorityFeeLamports: number;
  }) {
    this.config = opts.config;
    this.jupiterBaseUrl = opts.jupiterBaseUrl;
    this.maxSlippageBps = opts.maxSlippageBps;
    this.asLegacyTransaction = opts.asLegacyTransaction;
    this.priorityFeeLamports = opts.priorityFeeLamports;
  }

  // ── Startup ────────────────────────────────────────────────────
  logStartupConfig(): void {
    this.logger.info('[INVENTORY] startup config', {
      autoFundEnabled: this.config.autoFundEnabled,
      baseAsset: this.config.baseAsset,
      baseAssetMint: this.config.baseAssetMint,
      minSolReserve: this.config.minSolReserve,
      targetSolReserve: this.config.targetSolReserve,
      autoFundMinSwapUsd: this.config.autoFundMinSwapUsd,
      fundingRebalanceIntervalMs: this.config.fundingRebalanceIntervalMs,
      positionSizeFraction: this.config.positionSizeFraction,
      minTradeUsd: this.config.minTradeUsd,
      maxTradeUsd: this.config.maxTradeUsd,
      compoundProfits: this.config.compoundProfits,
    });
  }

  // ── Funding lock ───────────────────────────────────────────────
  acquireLock(): boolean {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  releaseLock(): void {
    this.locked = false;
  }

  isLocked(): boolean {
    return this.locked;
  }

  // ── Periodic rebalance loop ────────────────────────────────────
  startRebalanceLoop(connection: Connection, wallet: Keypair): void {
    if (!this.config.autoFundEnabled) {
      this.logger.info('[INVENTORY] auto-funding disabled, skipping rebalance loop');
      return;
    }
    if (this.rebalanceTimer) return;

    this.logger.info('[INVENTORY] starting rebalance loop', {
      intervalMs: this.config.fundingRebalanceIntervalMs,
    });

    this.rebalanceTimer = setInterval(async () => {
      try {
        await this.runFundingRebalanceIfNeeded(connection, wallet);
      } catch (err) {
        this.logger.error('[INVENTORY] rebalance loop error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, this.config.fundingRebalanceIntervalMs);
  }

  stopRebalanceLoop(): void {
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }
  }

  // ── Balance scanning ───────────────────────────────────────────
  async refreshBalances(connection: Connection, walletPublicKey: string): Promise<InventorySnapshot> {
    const owner = new PublicKey(walletPublicKey);

    // SOL balance
    const solLamports = await connection.getBalance(owner, 'confirmed');
    const solBalance = solLamports / 1e9;
    const solPriceUsd = await this.fetchSolPriceUsd();

    // SPL token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    }, 'confirmed');

    const balances = new Map<string, number>();
    const unsupported: Array<{ mint: string; rawAmount: number }> = [];

    for (const account of tokenAccounts.value) {
      const parsed = account.account.data.parsed as {
        info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } };
      };
      const mint = parsed.info?.mint;
      const tokenAmount = parsed.info?.tokenAmount;
      if (!mint || !tokenAmount) continue;

      const rawAmount = Number(tokenAmount.amount || '0');
      if (rawAmount === 0) continue;

      if (SUPPORTED_MINTS.has(mint)) {
        const decimals = tokenAmount.decimals ?? MINT_DECIMALS[mint] ?? 6;
        balances.set(mint, (balances.get(mint) ?? 0) + rawAmount / 10 ** decimals);
      } else {
        unsupported.push({ mint, rawAmount });
      }
    }

    if (unsupported.length > 0) {
      this.logger.info('[INVENTORY] unsupported token deposits detected (ignored)', {
        count: unsupported.length,
        mints: unsupported.slice(0, 5).map(u => u.mint),
      });
    }

    // Classify
    const baseAssetBalance = balances.get(this.config.baseAssetMint) ?? 0;

    const nonBaseMint = this.config.baseAsset === 'USDC' ? MINT_USDT : MINT_USDC;
    const nonBaseStableBalance = balances.get(nonBaseMint) ?? 0;

    const solReserveDeficit = Math.max(0, this.config.minSolReserve - solBalance);
    const solReserveExcess = Math.max(0, solBalance - this.config.targetSolReserve);

    // Available trading capital = base asset only
    const availableTradingCapitalUsd = baseAssetBalance; // stables ≈ $1
    const recommendedTradeSizeUsd = this.computeRecommendedTradeSize(availableTradingCapitalUsd);

    let tradingBlocked = false;
    let blockReason: string | null = null;
    if (solBalance < this.config.minSolReserve) {
      tradingBlocked = true;
      blockReason = `SOL reserve deficit: ${solBalance.toFixed(4)} < min ${this.config.minSolReserve}`;
    } else if (availableTradingCapitalUsd < this.config.minTradeUsd) {
      tradingBlocked = true;
      blockReason = `insufficient base asset: $${availableTradingCapitalUsd.toFixed(2)} < min $${this.config.minTradeUsd}`;
    }

    const snapshot: InventorySnapshot = {
      solBalance,
      solReserveDeficit,
      solReserveExcess,
      baseAssetBalance,
      baseAssetMint: this.config.baseAssetMint,
      baseAssetSymbol: this.config.baseAsset,
      nonBaseStableBalance,
      nonBaseStableMint: nonBaseStableBalance > 0 ? nonBaseMint : null,
      unsupportedTokens: unsupported,
      availableTradingCapitalUsd,
      recommendedTradeSizeUsd,
      tradingBlocked,
      blockReason,
      solPriceUsd,
      timestampMs: Date.now(),
    };

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  // ── Snapshot access ────────────────────────────────────────────
  getInventorySnapshot(): InventorySnapshot | null {
    return this.lastSnapshot;
  }

  getAvailableTradingCapitalUsd(): number {
    return this.lastSnapshot?.availableTradingCapitalUsd ?? 0;
  }

  getRecommendedTradeSizeUsd(): number {
    return this.lastSnapshot?.recommendedTradeSizeUsd ?? 0;
  }

  // ── Position sizing ────────────────────────────────────────────
  computeRecommendedTradeSize(availableCapitalUsd: number): number {
    const proposed = availableCapitalUsd * this.config.positionSizeFraction;
    if (proposed < this.config.minTradeUsd) return 0;
    return Math.min(proposed, this.config.maxTradeUsd);
  }

  // ── Rebalance decisions ────────────────────────────────────────
  needsFundingRebalance(): boolean {
    if (!this.config.autoFundEnabled) return false;
    if (!this.lastSnapshot) return false;
    const snapshot = this.lastSnapshot;

    // SOL reserve deficit → swap base to SOL
    if (snapshot.solReserveDeficit > 0 && snapshot.baseAssetBalance > this.config.autoFundMinSwapUsd) {
      return true;
    }
    // Excess SOL above target → swap to base
    if (snapshot.solReserveExcess > 0) {
      const excessUsd = snapshot.solReserveExcess * snapshot.solPriceUsd;
      if (excessUsd >= this.config.autoFundMinSwapUsd) return true;
    }
    // Non-base stablecoin → swap to base
    if (snapshot.nonBaseStableBalance >= this.config.autoFundMinSwapUsd) {
      return true;
    }
    return false;
  }

  private computeRebalanceDecisions(snapshot: InventorySnapshot): RebalanceDecision[] {
    const decisions: RebalanceDecision[] = [];
    const solPriceUsd = snapshot.solPriceUsd;

    // Priority 1: SOL reserve deficit — swap small amount of base to SOL
    if (snapshot.solReserveDeficit > 0 && snapshot.baseAssetBalance > this.config.autoFundMinSwapUsd) {
      // Swap enough base to restore to target reserve
      const solNeeded = Math.min(
        this.config.targetSolReserve - snapshot.solBalance + snapshot.solReserveDeficit,
        this.config.targetSolReserve
      );
      const usdNeeded = solNeeded * solPriceUsd;
      if (usdNeeded >= 0.01 && snapshot.baseAssetBalance > usdNeeded) {
        const decimals = MINT_DECIMALS[this.config.baseAssetMint] ?? 6;
        decisions.push({
          action: 'swap_base_to_sol',
          reason: `restore SOL reserve: ${snapshot.solBalance.toFixed(4)} → target ${this.config.targetSolReserve}`,
          inputMint: this.config.baseAssetMint,
          outputMint: WRAPPED_SOL_MINT,
          amountRaw: Math.floor(usdNeeded * 10 ** decimals),
          estimatedUsd: usdNeeded,
        });
      }
      // If SOL reserve is critically low, do not proceed with other swaps
      return decisions;
    }

    // Priority 2: Excess SOL → swap to base asset
    if (snapshot.solReserveExcess > 0) {
      const excessUsd = snapshot.solReserveExcess * solPriceUsd;
      if (excessUsd >= this.config.autoFundMinSwapUsd) {
        decisions.push({
          action: 'swap_sol_to_base',
          reason: `excess SOL: ${snapshot.solBalance.toFixed(4)} above target ${this.config.targetSolReserve}`,
          inputMint: WRAPPED_SOL_MINT,
          outputMint: this.config.baseAssetMint,
          amountRaw: Math.floor(snapshot.solReserveExcess * 1e9),
          estimatedUsd: excessUsd,
        });
      }
    }

    // Priority 3: Non-base stablecoin → swap to base
    if (snapshot.nonBaseStableBalance >= this.config.autoFundMinSwapUsd && snapshot.nonBaseStableMint) {
      const nonBaseMint = snapshot.nonBaseStableMint;
      const decimals = MINT_DECIMALS[nonBaseMint] ?? 6;
      decisions.push({
        action: 'swap_stable_to_base',
        reason: `non-base stable ${MINT_SYMBOL[nonBaseMint] ?? 'unknown'}: $${snapshot.nonBaseStableBalance.toFixed(2)} → ${this.config.baseAsset}`,
        inputMint: nonBaseMint,
        outputMint: this.config.baseAssetMint,
        amountRaw: Math.floor(snapshot.nonBaseStableBalance * 10 ** decimals),
        estimatedUsd: snapshot.nonBaseStableBalance,
      });
    }

    return decisions;
  }

  // ── Execute rebalance ──────────────────────────────────────────
  async runFundingRebalanceIfNeeded(connection: Connection, wallet: Keypair): Promise<void> {
    if (!this.config.autoFundEnabled) return;

    const now = Date.now();
    if (now - this.lastRebalanceAtMs < this.config.fundingRebalanceIntervalMs) return;

    if (!this.acquireLock()) {
      this.logger.debug('[INVENTORY] rebalance skipped — lock held (active trade)');
      return;
    }

    try {
      const snapshot = await this.refreshBalances(connection, wallet.publicKey.toBase58());
      this.logInventorySnapshot(snapshot);

      if (!this.needsFundingRebalance()) {
        this.logger.debug('[INVENTORY] no rebalance needed', {
          solBalance: snapshot.solBalance,
          baseAssetBalance: snapshot.baseAssetBalance,
          nonBaseStableBalance: snapshot.nonBaseStableBalance,
        });
        this.lastRebalanceAtMs = now;
        return;
      }

      const decisions = this.computeRebalanceDecisions(snapshot);
      for (const decision of decisions) {
        this.logger.info('[INVENTORY] rebalance decision', {
          action: decision.action,
          reason: decision.reason,
          inputMint: decision.inputMint,
          outputMint: decision.outputMint,
          estimatedUsd: decision.estimatedUsd,
        });

        try {
          await this.executeFundingSwap(connection, wallet, decision);
        } catch (err) {
          this.logger.warn('[INVENTORY] rebalance swap failed', {
            action: decision.action,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Refresh after rebalance
      const postSnapshot = await this.refreshBalances(connection, wallet.publicKey.toBase58());
      this.logger.info('[INVENTORY] post-rebalance balances', {
        solBalance: postSnapshot.solBalance,
        baseAssetBalance: postSnapshot.baseAssetBalance,
        availableTradingCapitalUsd: postSnapshot.availableTradingCapitalUsd,
        recommendedTradeSizeUsd: postSnapshot.recommendedTradeSizeUsd,
      });

      this.lastRebalanceAtMs = now;
    } finally {
      this.releaseLock();
    }
  }

  // ── Execute a single funding swap via Jupiter ──────────────────
  private async executeFundingSwap(
    connection: Connection,
    wallet: Keypair,
    decision: RebalanceDecision,
  ): Promise<void> {
    // Step 1: Get quote
    const quoteUrl = new URL(`${this.jupiterBaseUrl}/quote`);
    quoteUrl.searchParams.set('inputMint', decision.inputMint);
    quoteUrl.searchParams.set('outputMint', decision.outputMint);
    quoteUrl.searchParams.set('amount', String(decision.amountRaw));
    quoteUrl.searchParams.set('slippageBps', String(this.maxSlippageBps));

    this.logger.info('[INVENTORY] funding quote request', {
      inputMint: decision.inputMint,
      outputMint: decision.outputMint,
      amountRaw: decision.amountRaw,
      slippageBps: this.maxSlippageBps,
    });

    const quoteResp = await fetch(quoteUrl.toString());
    if (!quoteResp.ok) {
      throw new Error(`Jupiter funding quote HTTP ${quoteResp.status}`);
    }
    const quoteResponse = await quoteResp.json() as JupiterQuoteResponse;

    this.logger.info('[INVENTORY] funding quote received', {
      outAmount: quoteResponse.outAmount,
      priceImpactPct: quoteResponse.priceImpactPct,
      routeLegs: quoteResponse.routePlan?.length ?? 0,
    });

    // Step 2: Build swap
    const swapRequestBody: Record<string, unknown> = {
      quoteResponse,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: this.priorityFeeLamports,
          priorityLevel: 'medium',
        },
      },
      asLegacyTransaction: this.asLegacyTransaction,
    };

    this.logger.info('[INVENTORY] funding swap build request', {
      action: decision.action,
      estimatedUsd: decision.estimatedUsd,
    });

    const swapResp = await fetch(`${this.jupiterBaseUrl}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(swapRequestBody),
    });

    if (!swapResp.ok) {
      const errorBody = await swapResp.text().catch(() => '');
      throw new Error(`Jupiter funding swap HTTP ${swapResp.status}: ${errorBody.slice(0, 200)}`);
    }

    const swapBody = await swapResp.json() as {
      swapTransaction?: string;
      dynamicSlippageReport?: unknown;
    };
    if (!swapBody.swapTransaction) {
      throw new Error('Jupiter funding swap missing swapTransaction');
    }

    if (swapBody.dynamicSlippageReport) {
      this.logger.debug('[INVENTORY] dynamicSlippageReport', swapBody.dynamicSlippageReport);
    }

    // Step 3: Sign & send
    const transaction = VersionedTransaction.deserialize(Buffer.from(swapBody.swapTransaction, 'base64'));
    transaction.sign([wallet]);

    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      maxRetries: 2,
    });

    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    if (confirmation.value.err) {
      throw new Error(`funding swap confirmed with error: ${JSON.stringify(confirmation.value.err)}`);
    }

    // Log actual transaction fee paid
    let feeLogFields: Record<string, unknown> = {};
    try {
      const txDetails = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (txDetails?.meta) {
        const feeLamports = txDetails.meta.fee;
        const computeUnitsConsumed = txDetails.meta.computeUnitsConsumed ?? 0;
        feeLogFields = {
          feeLamports,
          feeSol: feeLamports / 1e9,
          computeUnitsConsumed,
          effectiveCuPrice: computeUnitsConsumed > 0
            ? Math.round(((feeLamports - 5000) * 1e6) / computeUnitsConsumed)
            : 0,
        };
      }
    } catch {
      // Non-critical — fee logging is best-effort
    }

    this.logger.info('[INVENTORY] funding swap confirmed', {
      signature,
      action: decision.action,
      estimatedUsd: decision.estimatedUsd,
      ...feeLogFields,
    });
  }

  // ── PnL tracking ──────────────────────────────────────────────
  recordTradeResult(preTradeBaseBalance: number, postTradeBaseBalance: number): void {
    const realizedPnl = postTradeBaseBalance - preTradeBaseBalance;
    this.cumulativeRealizedPnlUsd += realizedPnl;

    this.logger.info('[INVENTORY] trade PnL', {
      preTradeBaseBalance,
      postTradeBaseBalance,
      realizedPnlUsd: realizedPnl,
      cumulativeRealizedPnlUsd: this.cumulativeRealizedPnlUsd,
      compoundingEnabled: this.config.compoundProfits,
    });
  }

  getCumulativeRealizedPnlUsd(): number {
    return this.cumulativeRealizedPnlUsd;
  }

  // ── Trading gate check ─────────────────────────────────────────
  checkTradingGate(snapshot?: InventorySnapshot | null): {
    allowed: boolean;
    reason: string | null;
    availableCapitalUsd: number;
    recommendedSizeUsd: number;
  } {
    const s = snapshot ?? this.lastSnapshot;
    if (!s) {
      return { allowed: false, reason: 'no inventory snapshot available', availableCapitalUsd: 0, recommendedSizeUsd: 0 };
    }
    if (s.tradingBlocked) {
      return { allowed: false, reason: s.blockReason, availableCapitalUsd: s.availableTradingCapitalUsd, recommendedSizeUsd: 0 };
    }
    return {
      allowed: true,
      reason: null,
      availableCapitalUsd: s.availableTradingCapitalUsd,
      recommendedSizeUsd: s.recommendedTradeSizeUsd,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────
  private logInventorySnapshot(snapshot: InventorySnapshot): void {
    this.logger.info('[INVENTORY] balance snapshot', {
      solBalance: snapshot.solBalance,
      solReserveDeficit: snapshot.solReserveDeficit,
      solReserveExcess: snapshot.solReserveExcess,
      baseAsset: snapshot.baseAssetSymbol,
      baseAssetBalance: snapshot.baseAssetBalance,
      nonBaseStableBalance: snapshot.nonBaseStableBalance,
      unsupportedTokenCount: snapshot.unsupportedTokens.length,
      availableTradingCapitalUsd: snapshot.availableTradingCapitalUsd,
      recommendedTradeSizeUsd: snapshot.recommendedTradeSizeUsd,
      tradingBlocked: snapshot.tradingBlocked,
      blockReason: snapshot.blockReason,
      solPriceUsd: snapshot.solPriceUsd,
    });
  }

  private async fetchSolPriceUsd(): Promise<number> {
    try {
      const url = new URL(`${this.jupiterBaseUrl}/quote`);
      url.searchParams.set('inputMint', WRAPPED_SOL_MINT);
      url.searchParams.set('outputMint', MINT_USDC);
      url.searchParams.set('amount', '1000000000'); // 1 SOL
      url.searchParams.set('slippageBps', '50');

      const response = await fetch(url.toString());
      if (!response.ok) {
        this.logger.warn('[INVENTORY] SOL price fetch failed', { status: response.status });
        return 0;
      }

      const quote = await response.json() as JupiterQuoteResponse;
      const outAmount = Number(quote.outAmount || '0');
      if (!Number.isFinite(outAmount) || outAmount <= 0) return 0;
      return outAmount / 1e6; // USDC has 6 decimals
    } catch (err) {
      this.logger.warn('[INVENTORY] SOL price fetch error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }
}
