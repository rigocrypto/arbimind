import type { ArbitrageOpportunity } from '../types';
import crypto from 'crypto';

export interface AiScoreResult {
  expectedProfitPct: number;
  successProb: number;
  recommendation?: 'EXECUTE' | 'WAIT' | 'AVOID';
}

export interface AiScoringConfig {
  predictUrl?: string;
  logUrl?: string;
  serviceKey?: string;
  modelTag?: string;
  horizonSec?: number;
}

export class AiScoringService {
  constructor(private readonly config: AiScoringConfig) {}

  public async scoreOpportunity(
    opportunity: ArbitrageOpportunity,
    context: { chain: 'evm' | 'solana'; pairAddress: string }
  ): Promise<AiScoreResult | null> {
    if (!this.config.predictUrl) return null;

    const payload = {
      profitPct: opportunity.profitPercent ?? 0,
      volumeUsd: 0,
      liquidity: 0,
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
      console.warn('[AiScoringService] Missing chain or pairAddress; skipping AI log payload.');
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
