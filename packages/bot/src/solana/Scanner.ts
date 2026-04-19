/**
 * Solana Scanner
 * Polls watched pools from DexScreener, scores with AI, logs predictions
 */

import { SolanaExecutor, type SwapOpportunity } from './Executor';
import { solanaConfig, solanaExecutorConfig, inventoryConfig, priorityFeeConfig, exp020Config, enabledPairs, TOKEN_REGISTRY } from './config';
import { config } from '../config';
import { Logger } from '../utils/Logger';
import { AiScoringService, AiScoringConfig } from '../services/AiScoringService';
import { getLiquidityRegime, makeRegimeLogEntry } from './liquidityRegime';
import { SolanaInventoryManager } from './InventoryManager';
import { FundingManager } from './FundingManager';
import { PriorityFeeEstimator } from './PriorityFeeEstimator';
import { LandingTracker } from './LandingTracker';
import { NetEdgeAccumulator } from './NetEdgeAccumulator';
import { resolveSpeedTierPolicy, type TierPolicy } from './SpeedTierPolicy';
import { SessionMetrics } from './SessionMetrics';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const logger = new Logger('SolanaScanner');
const STABLE_SYMBOLS = new Set(['USDC', 'USDT']);
const SOLANA_MIN_EXECUTION_CONFIDENCE = Number.parseFloat(process.env['SOLANA_MIN_EXECUTION_CONFIDENCE'] || '0.85');

type DexPairData = {
  volumeH24?: number;
  liquidityUsd?: number;
  priceUsd?: number;
  priceNative?: number;
  baseMint?: string;
  baseSymbol?: string;
  quoteMint?: string;
  quoteSymbol?: string;
};

type DexScreenerResponse = {
  pair?: {
    volume?: { h24?: number };
    liquidity?: { usd?: number };
    priceUsd?: number;
    priceNative?: string;
    baseToken?: { address?: string; symbol?: string };
    quoteToken?: { address?: string; symbol?: string };
  };
};

type AlertPredictionPayload = {
  pairAddress: string;
  chain: 'solana';
  horizonSec: number;
  model: string;
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  entryPriceUsd?: number;
  features: {
    volumeH24: number;
    liquidityUsd: number;
  };
  reason: 'solana_scan';
  alertContext: { source: 'solana_bot' };
};

export class SolanaScanner {
  private aiScoringService: AiScoringService;
  private executor: SolanaExecutor | null;
  private inventoryManager: SolanaInventoryManager | null = null;
  private fundingManager: FundingManager | null = null;
  private sessionMetrics: SessionMetrics;
  private scanConnection: Connection | null = null;
  private scanWallet: Keypair | null = null;
  private isRunning = false;

  constructor() {
    const aiConfig: AiScoringConfig = {
      horizonSec: config.aiPredictionHorizonSec,
    };
    if (config.aiPredictUrl) aiConfig.predictUrl = config.aiPredictUrl;
    if (config.aiLogUrl) aiConfig.logUrl = config.aiLogUrl;
    if (config.aiServiceKey) aiConfig.serviceKey = config.aiServiceKey;
    if (config.aiModelTag) aiConfig.modelTag = config.aiModelTag;
    
    this.aiScoringService = new AiScoringService(aiConfig);

    // Resolve speed tier policy
    const tierPolicy: TierPolicy = resolveSpeedTierPolicy({
      tier: exp020Config.speedTier,
      overrides: {
        priorityFeePercentile: priorityFeeConfig.percentile,
        cacheTtlMs: priorityFeeConfig.cacheTtlMs,
        minNetProfitUsd: exp020Config.minNetProfitUsd,
        riskBufferUsd: exp020Config.riskBufferUsd,
      },
    });

    // Shared dynamic priority fee estimator (with tier-aware config)
    const feeEstimatorConfig = {
      ...priorityFeeConfig,
      percentile: tierPolicy.priorityFeePercentile,
      cacheTtlMs: tierPolicy.cacheTtlMs,
    };
    const feeEstimator = new PriorityFeeEstimator(feeEstimatorConfig);

    // Shared landing tracker
    const landingTracker = new LandingTracker({
      warningThreshold: exp020Config.landingRateWarningThreshold,
      autoEscalate: exp020Config.landingRateAutoEscalate,
    });

    // Shared net edge accumulator
    const netEdgeAccumulator = new NetEdgeAccumulator({
      windowSize: exp020Config.netEdgeWindow,
      configuredMinTradeUsd: inventoryConfig.minTradeUsd,
    });

    // Session metrics — funnel counters, periodic summary
    const summaryIntervalMs = Number(process.env['SESSION_SUMMARY_INTERVAL_MS'] || '600000');
    this.sessionMetrics = new SessionMetrics({ summaryIntervalMs });

    this.executor = solanaExecutorConfig.tradingEnabled
      ? new SolanaExecutor(solanaExecutorConfig, feeEstimatorConfig, {
          landingTracker,
          netEdgeAccumulator,
          gateConfig: {
            minNetProfitUsd: tierPolicy.minNetProfitUsd,
            riskBufferUsd: tierPolicy.riskBufferUsd,
            slippageFallbackUsd: exp020Config.slippageFallbackUsd,
            slippageDiscountFactor: exp020Config.slippageDiscountFactor,
            executionHaircutUsd: exp020Config.executionHaircutUsd,
            minEdgeBps: exp020Config.minEdgeBps,
          },
          tierPolicy,
          sessionMetrics: this.sessionMetrics,
        })
      : null;

    // Set up inventory manager
    if (this.executor && inventoryConfig.autoFundEnabled) {
      this.inventoryManager = new SolanaInventoryManager({
        config: inventoryConfig,
        jupiterBaseUrl: solanaExecutorConfig.jupiterBaseUrl,
        maxSlippageBps: solanaExecutorConfig.maxSlippageBps,
        asLegacyTransaction: solanaExecutorConfig.asLegacyTransaction,
        priorityFeeLamports: solanaExecutorConfig.priorityFeeMicroLamports,
        feeEstimator,
        maxRebalanceCostBps: exp020Config.maxRebalanceCostBps,
        sessionMetrics: this.sessionMetrics,
      });
      this.executor.setInventoryManager(this.inventoryManager);
      this.inventoryManager.logStartupConfig();
    }

    // FundingManager — step 1: balance snapshot logging on each tick
    if (inventoryConfig.autoFundEnabled && solanaExecutorConfig.rpcUrl) {
      this.fundingManager = new FundingManager({
        targetSolReserve: inventoryConfig.targetSolReserve,
        minSolReserve: inventoryConfig.minSolReserve,
        baseAssetMint: inventoryConfig.baseAssetMint,
        baseAsset: inventoryConfig.baseAsset,
        minRebalanceUsd: inventoryConfig.autoFundMinSwapUsd,
        maxRebalanceCostBps: exp020Config.maxRebalanceCostBps,
        rebalanceCooldownMs: inventoryConfig.fundingRebalanceIntervalMs,
        jupiterBaseUrl: solanaExecutorConfig.jupiterBaseUrl,
      });
    }
  }

  /**
   * Start scanning watched pools at configured interval
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('⚠️  Solana scanner already running');
      return;
    }

    if (!solanaConfig.enabled) {
      logger.info('📭 Solana scanner disabled (set SOLANA_SCANNER_ENABLED=true to enable)');
      return;
    }

    if (solanaConfig.watchedPools.length === 0) {
      logger.info('📭 No Solana pools to watch; skipping scanner');
      return;
    }

    this.isRunning = true;
    logger.info(`🪐 Starting Solana scanner (interval: ${solanaConfig.scanIntervalSec}s, pools: ${solanaConfig.watchedPools.length})`);
    logger.info('🧭 Solana confidence gate', {
      aiMinSuccessProb: config.aiMinSuccessProb,
      solanaMinExecutionConfidence: SOLANA_MIN_EXECUTION_CONFIDENCE,
      effectiveThreshold: Math.max(config.aiMinSuccessProb, SOLANA_MIN_EXECUTION_CONFIDENCE),
    });
    if (solanaExecutorConfig.tradingEnabled) {
      logger.warn('🧪 Solana executor armed', {
        logOnly: solanaExecutorConfig.logOnly,
        canaryMode: solanaExecutorConfig.canaryMode,
        maxNotionalUsd: solanaExecutorConfig.maxNotionalUsd,
        maxDailyLossUsd: solanaExecutorConfig.maxDailyLossUsd,
      });

      // EXP-020 policy summary
      const tierPolicy: TierPolicy = resolveSpeedTierPolicy({
        tier: exp020Config.speedTier,
        overrides: {
          priorityFeePercentile: priorityFeeConfig.percentile,
          minNetProfitUsd: exp020Config.minNetProfitUsd,
          riskBufferUsd: exp020Config.riskBufferUsd,
        },
      });
      logger.info('📊 EXP-020 policy summary', {
        speedTier: exp020Config.speedTier,
        priorityFeePercentile: tierPolicy.priorityFeePercentile,
        cacheTtlMs: tierPolicy.cacheTtlMs,
        minNetProfitUsd: tierPolicy.minNetProfitUsd,
        riskBufferUsd: tierPolicy.riskBufferUsd,
        slippageFallbackUsd: exp020Config.slippageFallbackUsd,
        executionHaircutUsd: exp020Config.executionHaircutUsd,
        minEdgeBps: exp020Config.minEdgeBps,
        maxRebalanceCostBps: exp020Config.maxRebalanceCostBps,
        landingRateWarningThreshold: exp020Config.landingRateWarningThreshold,
        landingRateAutoEscalate: exp020Config.landingRateAutoEscalate,
        netEdgeWindow: exp020Config.netEdgeWindow,
      });

      logger.info('🎯 Enabled trading pairs', {
        pairs: enabledPairs.map(p => `${p.base}/${p.quote}`),
        pairCount: enabledPairs.length,
      });
    }

    // Start inventory rebalance loop if configured
    if (this.inventoryManager && solanaExecutorConfig.rpcUrl) {
      const wallet = this.resolveWallet();
      if (wallet) {
        const connection = new Connection(solanaExecutorConfig.rpcUrl, { commitment: 'confirmed' });
        // Cache for FundingManager per-tick calls
        this.scanConnection = connection;
        this.scanWallet = wallet;
        // Initial snapshot
        this.inventoryManager.refreshBalances(connection, wallet.publicKey.toBase58())
          .then((snapshot) => {
            logger.info('[SOLANA] initial inventory snapshot', {
              solBalance: snapshot.solBalance,
              baseAssetBalance: snapshot.baseAssetBalance,
              availableTradingCapitalUsd: snapshot.availableTradingCapitalUsd,
              tradingBlocked: snapshot.tradingBlocked,
              blockReason: snapshot.blockReason,
            });
          })
          .catch((err) => {
            logger.warn('[SOLANA] initial inventory snapshot failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        this.inventoryManager.startRebalanceLoop(connection, wallet);
      }
    }

    // Resolve connection/wallet for FundingManager if not already cached
    if (this.fundingManager && !this.scanConnection && solanaExecutorConfig.rpcUrl) {
      const wallet = this.resolveWallet();
      if (wallet) {
        this.scanConnection = new Connection(solanaExecutorConfig.rpcUrl, { commitment: 'confirmed' });
        this.scanWallet = wallet;
      }
    }

    // ── funding_manager_init diagnostic (raw JSON to stdout) ──
    if (this.fundingManager && this.scanWallet) {
      console.log(JSON.stringify({
        event: 'funding_manager_init',
        ts: new Date().toISOString(),
        autoFundEnabled: true,
        walletPubkey: this.scanWallet.publicKey.toBase58(),
        baseAssetMint: inventoryConfig.baseAssetMint,
        solReserveTarget: inventoryConfig.targetSolReserve,
        solReserveMin: inventoryConfig.minSolReserve,
        autoFundMinSwapUsd: inventoryConfig.autoFundMinSwapUsd,
        autoFundMaxRebalanceCostBps: exp020Config.maxRebalanceCostBps,
        rebalanceCooldownMs: inventoryConfig.fundingRebalanceIntervalMs,
      }));
    } else {
      console.log(JSON.stringify({
        event: 'funding_manager_init',
        ts: new Date().toISOString(),
        autoFundEnabled: false,
        reason: 'SOLANA_AUTO_FUND_ENABLED not set or false',
      }));
    }

    this.sessionMetrics.startPeriodicSummary();
    this.scanLoop();
  }

  /**
   * Stop the scanner
   */
  stop(): void {
    logger.info('🛑 Stopping Solana scanner');
    this.isRunning = false;
    this.sessionMetrics.stopPeriodicSummary();
    // Emit final summary on shutdown
    this.sessionMetrics.emitSummary();
    if (this.inventoryManager) {
      this.inventoryManager.stopRebalanceLoop();
    }
  }

  /**
   * Resolve wallet keypair from config (mirrors Executor.getWallet parsing).
   */
  private resolveWallet(): Keypair | null {
    const raw = solanaExecutorConfig.privateKeyBase58?.trim();
    if (!raw) return null;
    try {
      const decoded = bs58.decode(raw);
      if (decoded.length === 64) return Keypair.fromSecretKey(decoded);
      if (decoded.length === 32) return Keypair.fromSeed(decoded);
    } catch { /* try next */ }
    try {
      if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        return Keypair.fromSeed(Uint8Array.from(Buffer.from(raw, 'hex')));
      }
      if (raw.startsWith('[') && raw.endsWith(']')) {
        const parsed = JSON.parse(raw) as number[];
        if (Array.isArray(parsed) && parsed.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) {
          const bytes = Uint8Array.from(parsed);
          if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
          if (bytes.length === 32) return Keypair.fromSeed(bytes);
        }
      }
    } catch { /* ignore */ }
    logger.warn('[SOLANA] resolveWallet: unsupported key format');
    return null;
  }

  /**
   * Main scan loop
   */
  private async scanLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.scanPools();
      } catch (error) {
        logger.error('❌ Scan loop error', {
          error: error instanceof Error ? error.message : error,
        });
      }

      // Sleep until next interval
      await new Promise((resolve) => setTimeout(resolve, solanaConfig.scanIntervalSec * 1000));
    }
  }

  /**
   * Scan all watched pools
   */
  private async scanPools(): Promise<void> {
    // FundingManager: snapshot + (future) rebalance on each tick
    if (this.fundingManager && this.scanConnection && this.scanWallet) {
      try {
        await this.fundingManager.checkAndRebalance(
          this.scanConnection,
          this.scanWallet,
        );
      } catch (err) {
        logger.warn('[FUNDING] checkAndRebalance error', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const pool of solanaConfig.watchedPools) {
      await this.scanPool(pool);
    }
  }

  /**
   * Scan a single pool: fetch data, score, log prediction
   */
  private async scanPool(poolAddress: string): Promise<void> {
    try {
      // Fetch pool data from DexScreener
      const pairData = await this.fetchDexPair(poolAddress);
      if (!pairData) {
        logger.debug(`📊 Skipping ${poolAddress}: no data`);
        return;
      }

      // Resolve pair metadata for AI scoring
      const pairBaseSymbol = pairData.baseSymbol?.toUpperCase() ?? 'UNKNOWN';
      const pairQuoteSymbol = pairData.quoteSymbol?.toUpperCase() ?? 'UNKNOWN';
      const pairBaseMeta = TOKEN_REGISTRY[pairBaseSymbol];
      const pairQuoteMeta = TOKEN_REGISTRY[pairQuoteSymbol];

      // Score with AI
      const score = await this.aiScoringService.scoreOpportunity(
        {
          tokenA: pairBaseMeta?.symbol ?? pairBaseSymbol,
          tokenB: pairQuoteMeta?.symbol ?? pairQuoteSymbol,
          dex1: 'RAYDIUM',
          dex2: 'RAYDIUM',
          amountIn: String(10 ** (pairBaseMeta?.decimals ?? 9)),
          amountOut1: '0',
          amountOut2: '0',
          profit: '0',
          profitPercent: 0.5,
          gasEstimate: '0',
          netProfit: '0',
          decimalsIn: pairBaseMeta?.decimals ?? 9,
          decimalsOut: pairQuoteMeta?.decimals ?? 6,
          route: 'SOLANA',
          timestamp: Date.now(),
        },
        { chain: 'solana', pairAddress: poolAddress }
      );

      if (!score) {
        logger.debug(`🤖 No AI score for ${poolAddress}`);
        return;
      }

      // Log prediction if confidence is high
      const regime = getLiquidityRegime();
      if (score.successProb > config.aiMinSuccessProb) {
        const signal = score.expectedProfitPct > 0 ? 'LONG' : 'SHORT';
        await this.logPrediction(poolAddress, signal, score.successProb, pairData);
        await this.maybeExecuteTrade(poolAddress, signal, pairData, score.successProb, score.expectedProfitPct, regime);
        logger.info(`✅ [SOLANA] Scored ${poolAddress}: ${signal} (${(score.successProb * 100).toFixed(1)}%)`, {
          regimeLabel: regime.regimeLabel, utcHour: regime.utcHour, isWeekend: regime.isWeekend,
        });
      }
    } catch (error) {
      logger.error(`❌ Failed to scan pool ${poolAddress}`, {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Fetch pair data from DexScreener
   */
  private async fetchDexPair(poolAddress: string): Promise<DexPairData | null> {
    try {
      const resp = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${poolAddress}`, {
        headers: { 'User-Agent': 'ArbiMind-Bot/1.0' },
      });

      if (!resp.ok) {
        return null;
      }

      const body = (await resp.json()) as DexScreenerResponse;
      const pair = body?.pair;

      if (!pair) {
        return null;
      }

      return {
        volumeH24: pair.volume?.h24,
        liquidityUsd: pair.liquidity?.usd,
        priceUsd: pair.priceUsd,
        priceNative: pair.priceNative ? Number(pair.priceNative) : undefined,
        baseMint: pair.baseToken?.address,
        baseSymbol: pair.baseToken?.symbol,
        quoteMint: pair.quoteToken?.address,
        quoteSymbol: pair.quoteToken?.symbol,
      };
    } catch (error) {
      logger.debug(`Failed to fetch DexScreener data for ${poolAddress}`, {
        error: error instanceof Error ? error.message : error,
      });
      return null;
    }
  }

  /**
   * Log a prediction to the backend
   */
  private async logPrediction(
    poolAddress: string,
    signal: 'LONG' | 'SHORT' | 'NEUTRAL',
    confidence: number,
    pairData: DexPairData
  ): Promise<void> {
    if (!config.aiLogUrl || !config.aiServiceKey) {
      logger.debug('AI logging disabled (missing URL or key)');
      return;
    }

    try {
      const payload: AlertPredictionPayload = {
        pairAddress: poolAddress,
        chain: 'solana',
        horizonSec: config.aiPredictionHorizonSec,
        model: config.aiModelTag || 'solana-default',
        signal,
        confidence,
        entryPriceUsd: pairData?.priceUsd,
        features: {
          volumeH24: pairData?.volumeH24 ?? 0,
          liquidityUsd: pairData?.liquidityUsd ?? 0,
        },
        reason: 'solana_scan',
        alertContext: { source: 'solana_bot' },
      };

      const resp = await fetch(config.aiLogUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SERVICE-KEY': config.aiServiceKey,
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        logger.warn(`Failed to log prediction: ${resp.status}`);
      }

      // Dispatch alert if confidence is high and backend URL is configured
      if (confidence >= (parseFloat(process.env['ALERT_MIN_CONFIDENCE'] || '0.8'))) {
        await this.dispatchAlert(payload);
      }
    } catch (error) {
      logger.debug('Failed to log prediction', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  /**
   * Dispatch alert for a high-confidence prediction
   */
  private async dispatchAlert(prediction: AlertPredictionPayload): Promise<void> {
    if (!config.aiLogUrl) {
      logger.debug('Backend URL not configured; skipping alert dispatch');
      return;
    }

    try {
      const alertUrl = config.aiLogUrl.replace(/\/[^/]+$/, '/ai-dashboard/alerts');
      const resp = await fetch(alertUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SERVICE-KEY': config.aiServiceKey || '',
        },
        body: JSON.stringify({ prediction }),
      });

      if (!resp.ok) {
        logger.debug(`Alert dispatch failed: ${resp.status}`);
        return;
      }

      const result = (await resp.json()) as { dispatched?: string[] };
      logger.info('✉️ Alert dispatched', {
        pair: prediction.pairAddress,
        channels: result.dispatched,
      });
    } catch (error) {
      logger.debug('Alert dispatch error', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  private async maybeExecuteTrade(
    poolAddress: string,
    signal: 'LONG' | 'SHORT' | 'NEUTRAL',
    pairData: DexPairData,
    confidence: number,
    expectedProfitPct: number,
    regime?: import('./liquidityRegime').LiquidityRegime
  ): Promise<void> {
    if (!this.executor) {
      return;
    }

    const opportunity = this.buildSwapOpportunity(poolAddress, signal, pairData, confidence, expectedProfitPct);
    if (!opportunity) {
      return;
    }

    this.sessionMetrics.recordDiscovered();
    const result = await this.executor.execute(opportunity);
    const r = regime ?? getLiquidityRegime();
    if (result.skipped) {
      logger.info('Solana execution skipped', {
        poolAddress,
        reason: result.skipReason,
      });
      logger.info('[SOLANA] regime_log', makeRegimeLogEntry(r, {
        confidence, scored: true, attempted: false,
      }));
      return;
    }

    if (result.logOnly) {
      logger.info('Solana log-only execution simulated', {
        poolAddress,
        label: opportunity.label,
      });
      logger.info('[SOLANA] regime_log', makeRegimeLogEntry(r, {
        confidence, scored: true, attempted: false,
      }));
      return;
    }

    if (result.success) {
      logger.info('Solana execution confirmed', {
        poolAddress,
        signature: result.signature,
      });
      logger.info('[SOLANA] regime_log', makeRegimeLogEntry(r, {
        confidence, scored: true, attempted: true, confirmed: true,
        ammLabel: opportunity.label,
      }));
      return;
    }

    logger.error('Solana execution failed', {
      poolAddress,
      error: result.error,
    });
    logger.info('[SOLANA] regime_log', makeRegimeLogEntry(r, {
      confidence, scored: true, attempted: true, confirmed: false,
      errorCode: result.error, ammLabel: opportunity.label,
    }));
  }

  private buildSwapOpportunity(
    poolAddress: string,
    signal: 'LONG' | 'SHORT' | 'NEUTRAL',
    pairData: DexPairData,
    confidence: number,
    expectedProfitPct: number
  ): SwapOpportunity | null {
    if (signal === 'NEUTRAL') {
      return null;
    }

    if (!pairData.baseMint || !pairData.quoteMint || !pairData.baseSymbol || !pairData.quoteSymbol) {
      logger.debug(`Skipping Solana execution for ${poolAddress}: missing token metadata`);
      return null;
    }

    const baseSymbol = pairData.baseSymbol.toUpperCase();
    const quoteSymbol = pairData.quoteSymbol.toUpperCase();
    const priceUsd = Number(pairData.priceUsd ?? 0);

    // Check if pair is in the enabled list (order-independent)
    const isEnabled = enabledPairs.some(p =>
      (p.base === baseSymbol && p.quote === quoteSymbol) ||
      (p.base === quoteSymbol && p.quote === baseSymbol)
    );
    if (!isEnabled) {
      logger.debug(`Skipping Solana execution for ${poolAddress}: pair ${baseSymbol}/${quoteSymbol} not in enabled pairs`);
      return null;
    }

    if (priceUsd <= 0) {
      logger.debug(`Skipping Solana execution for ${poolAddress}: invalid base price`);
      return null;
    }

    // Resolve token metadata from registry (canonical mints + decimals)
    const baseMeta = TOKEN_REGISTRY[baseSymbol];
    const quoteMeta = TOKEN_REGISTRY[quoteSymbol];
    if (!baseMeta || !quoteMeta) {
      logger.debug(`Skipping Solana execution for ${poolAddress}: ${baseSymbol} or ${quoteSymbol} not in token registry`);
      return null;
    }

    const cappedNotionalUsd = solanaExecutorConfig.canaryMode
      ? Math.min(solanaExecutorConfig.maxNotionalUsd, 5)
      : solanaExecutorConfig.maxNotionalUsd;
    const spreadBps = Math.abs(expectedProfitPct) * 100;
    const expectedProfitUsd = Math.abs(expectedProfitPct) * cappedNotionalUsd / 100;

    if (confidence < Math.max(config.aiMinSuccessProb, SOLANA_MIN_EXECUTION_CONFIDENCE)) {
      logger.debug(`Skipping Solana execution for ${poolAddress}: confidence ${confidence.toFixed(2)} below execution threshold`);
      return null;
    }

    if (spreadBps < solanaExecutorConfig.minSpreadBps) {
      logger.debug(`Skipping Solana execution for ${poolAddress}: spread ${spreadBps.toFixed(1)}bps below minimum ${solanaExecutorConfig.minSpreadBps.toFixed(1)}bps`);
      return null;
    }

    if (signal === 'LONG') {
      // Buy base with quote: input = quote token, output = base token
      // priceUsd = base token USD price; for non-stable quote we need the quote token price.
      // Derive from priceNative: quoteUsd = baseUsd / priceNative (e.g. mSOL $115 / 1.37 = SOL $84)
      const priceNative = pairData.priceNative;
      const inputPriceUsd = STABLE_SYMBOLS.has(quoteSymbol)
        ? 1
        : (priceNative && priceNative > 0 ? priceUsd / priceNative : priceUsd);
      const inputAmountRaw = Math.round((cappedNotionalUsd / inputPriceUsd) * 10 ** quoteMeta.decimals);
      return {
        inputMint: quoteMeta.mint,
        outputMint: baseMeta.mint,
        amountLamports: Math.max(1, inputAmountRaw),
        estimatedNotionalUsd: cappedNotionalUsd,
        expectedProfitUsd,
        spreadBps,
        label: `${quoteMeta.symbol}->${baseMeta.symbol} @ ${poolAddress}`,
      };
    }

    // SHORT: sell base for quote: input = base token, output = quote token
    const inputAmountRaw = Math.round((cappedNotionalUsd / priceUsd) * 10 ** baseMeta.decimals);
    return {
      inputMint: baseMeta.mint,
      outputMint: quoteMeta.mint,
      amountLamports: Math.max(1, inputAmountRaw),
      estimatedNotionalUsd: cappedNotionalUsd,
      expectedProfitUsd,
      spreadBps,
      label: `${baseMeta.symbol}->${quoteMeta.symbol} @ ${poolAddress}`,
    };
  }
}
