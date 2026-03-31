/**
 * Solana Scanner
 * Polls watched pools from DexScreener, scores with AI, logs predictions
 */

import { solanaConfig } from './config';
import { config } from '../config';
import { Logger } from '../utils/Logger';
import { AiScoringService, AiScoringConfig } from '../services/AiScoringService';

const logger = new Logger('SolanaScanner');

type DexPairData = {
  volumeH24?: number;
  liquidityUsd?: number;
  priceUsd?: number;
};

type DexScreenerResponse = {
  pair?: {
    volume?: { h24?: number };
    liquidity?: { usd?: number };
    priceUsd?: number;
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

    this.scanLoop();
  }

  /**
   * Stop the scanner
   */
  stop(): void {
    logger.info('🛑 Stopping Solana scanner');
    this.isRunning = false;
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

      // Score with AI
      const score = await this.aiScoringService.scoreOpportunity(
        {
          tokenA: 'SOL',
          tokenB: 'USDC',
          dex1: 'RAYDIUM',
          dex2: 'RAYDIUM',
          amountIn: '1000000000', // 1 SOL in lamports
          amountOut1: '0',
          amountOut2: '0',
          profit: '0',
          profitPercent: 0.5,
          gasEstimate: '0',
          netProfit: '0',
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
      if (score.successProb > config.aiMinSuccessProb) {
        const signal = score.expectedProfitPct > 0 ? 'LONG' : 'SHORT';
        await this.logPrediction(poolAddress, signal, score.successProb, pairData);
        logger.info(`✅ [SOLANA] Scored ${poolAddress}: ${signal} (${(score.successProb * 100).toFixed(1)}%)`);
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
  private async fetchDexPair(
    poolAddress: string
  ): Promise<{
    volumeH24?: number;
    liquidityUsd?: number;
    priceUsd?: number;
  } | null> {
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
}
