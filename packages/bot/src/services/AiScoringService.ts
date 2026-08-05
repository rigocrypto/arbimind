import type { ArbitrageOpportunity } from '../types';
import type { AiScoringMode } from '../config';
import crypto from 'crypto';
import { Logger } from '../utils/Logger';

export interface AiScoreResult {
  expectedProfitPct: number;
  successProb: number;
  recommendation?: 'EXECUTE' | 'WAIT' | 'AVOID';
}

export interface AiScoringConfig {
  /** How scoring is performed. Defaults to URL-derived behaviour when omitted. */
  mode?: AiScoringMode;
  predictUrl?: string;
  logUrl?: string;
  serviceKey?: string;
  modelTag?: string;
  horizonSec?: number;
}

/**
 * Why a scoring attempt did not yield a usable score.
 *
 * Distinguishing these is the entire point: an unconfigured scorer, a scorer
 * that erred, and a scorer that answered are three different situations that
 * previously all produced `null` and therefore identical silent zeros.
 */
export type AiScoreOutcome = 'scored' | 'unconfigured' | 'disabled' | 'error';

export interface AiScoreOutcomeResult {
  outcome: AiScoreOutcome;
  score: AiScoreResult | null;
  /** Present when outcome is 'error' or 'unconfigured'; safe to log. */
  reason?: string;
}

export class AiScoringService {
  private readonly logger = new Logger('AiScoringService');

  constructor(private readonly config: AiScoringConfig) {}

  /** Effective mode, derived from config when not set explicitly. */
  public get mode(): AiScoringMode {
    return this.config.mode ?? (this.config.predictUrl ? 'remote' : 'disabled');
  }

  /**
   * Score an opportunity, reporting *why* when no score is produced.
   *
   * Prefer this over {@link scoreOpportunity}: the boolean-ish `null` returned
   * by the older method cannot distinguish "not configured" from "the model
   * declined", which is how an unconfigured scorer previously masqueraded as a
   * quiet market for an entire run.
   */
  public async scoreOpportunityWithOutcome(
    opportunity: ArbitrageOpportunity,
    context: { chain: 'evm' | 'solana'; pairAddress: string; volumeUsd?: number; liquidityUsd?: number }
  ): Promise<AiScoreOutcomeResult> {
    const mode = this.mode;

    if (mode === 'disabled') {
      return {
        outcome: 'disabled',
        score: null,
        reason: 'AI_SCORING_MODE=disabled (or AI_PREDICT_URL unset and no mode chosen)',
      };
    }

    if (mode === 'remote' && !this.config.predictUrl) {
      return {
        outcome: 'unconfigured',
        score: null,
        reason: 'AI_SCORING_MODE=remote but AI_PREDICT_URL is not set',
      };
    }

    try {
      const score =
        mode === 'local'
          ? await this.scoreLocally(opportunity, context)
          : await this.scoreOpportunity(opportunity, context);
      if (!score) {
        return { outcome: 'error', score: null, reason: 'scorer returned no usable result' };
      }
      return { outcome: 'scored', score };
    } catch (error) {
      return {
        outcome: 'error',
        score: null,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * In-process scoring via the bundled predictor.
   *
   * `predictOpportunity` falls back to rule-based scoring when no TF.js model
   * file is present, so this path works with no model artefact and no network.
   */
  private async scoreLocally(
    opportunity: ArbitrageOpportunity,
    context: { chain: 'evm' | 'solana'; pairAddress: string; volumeUsd?: number; liquidityUsd?: number }
  ): Promise<AiScoreResult | null> {
    const { predictOpportunity } = await import('../ai/predictor.js');

    // predictOpportunity expects [delta (fraction), liquidity, volatility, sentiment].
    // profitPercent is a percentage, so convert; volatility and sentiment are not
    // available at this call site, so use the predictor's own documented defaults
    // rather than inventing signal that does not exist.
    const profitPct = opportunity.profitPercent ?? 0;
    const features = [Math.abs(profitPct) / 100, context.liquidityUsd ?? 0, 0.02, 0];

    const result = await predictOpportunity(features);
    return {
      successProb: result.confidence,
      expectedProfitPct: profitPct,
      recommendation: result.execute ? 'EXECUTE' : 'WAIT',
    };
  }

  public async scoreOpportunity(
    opportunity: ArbitrageOpportunity,
    context: { chain: 'evm' | 'solana'; pairAddress: string; volumeUsd?: number; liquidityUsd?: number }
  ): Promise<AiScoreResult | null> {
    if (!this.config.predictUrl) return null;

    const payload = {
      profitPct: opportunity.profitPercent ?? 0,
      volumeUsd: context.volumeUsd ?? 0,
      liquidity: context.liquidityUsd ?? 0,
      slippage: 0.5,
      gasPrice: 20
    };

    const res = await fetch(this.config.predictUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      return null;
    }

    const body = await res.json() as { success?: boolean; data?: AiScoreResult };
    if (!body?.data) return null;

    await this.logPrediction(body.data, context, payload);

    return body.data;
  }

  private async logPrediction(
    prediction: AiScoreResult,
    context: { chain: 'evm' | 'solana'; pairAddress: string },
    features: Record<string, number>
  ): Promise<void> {
    if (!this.config.logUrl || !this.config.serviceKey) return;

    const chain = context.chain;
    const pairAddress = context.pairAddress?.trim();
    if (!chain || !pairAddress) {
      this.logger.warn('Missing chain or pairAddress; skipping AI log payload.');
      return;
    }

    const bucket = Math.floor(Date.now() / 60000);
    const externalId = crypto
      .createHash('sha256')
      .update(`${chain}|${pairAddress}|${this.config.modelTag ?? 'default'}|${bucket}|${prediction.recommendation ?? 'NEUTRAL'}`)
      .digest('hex');

    const payload = {
      externalId,
      chain,
      pairAddress,
      horizonSec: this.config.horizonSec ?? 900,
      model: this.config.modelTag ?? 'default',
      signal: prediction.recommendation ?? 'NEUTRAL',
      confidence: prediction.successProb,
      entryPriceUsd: undefined,
      features,
      reason: 'ai_score',
      alertContext: { source: 'bot' }
    };

    try {
      await fetch(this.config.logUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SERVICE-KEY': this.config.serviceKey
        },
        body: JSON.stringify(payload)
      });

      // Dispatch alert if confidence is high
      const minConfidence = parseFloat(process.env['ALERT_MIN_CONFIDENCE'] || '0.8');
      if (payload.confidence >= minConfidence) {
        try {
          const alertUrl = this.config.logUrl.replace(/\/[^/]+$/, '/ai-dashboard/alerts');
          await fetch(alertUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-SERVICE-KEY': this.config.serviceKey
            },
            body: JSON.stringify({ prediction: payload })
          });
        } catch {
          // Alert dispatch failed; continue
        }
      }
    } catch {
      // no-op
    }
  }
}
