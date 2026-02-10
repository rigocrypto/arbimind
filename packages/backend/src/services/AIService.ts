import { logger } from '../utils/logger';
import { ArbitrageOpportunity, AIPrediction, TrainingData, ModelFeedback, PerformanceMetrics } from '../types';
import { SentimentModel } from '../models/SentimentModel';
import { RiskModel } from '../models/RiskModel';
import { ArbModel, ArbInput, ArbPrediction } from '../models/ArbModel';

export class AIService {
  private sentimentModel: SentimentModel;
  private riskModel: RiskModel;
  private arbModel: ArbModel;
  private initialized: boolean = false;

  constructor() {
    this.sentimentModel = new SentimentModel();
    this.riskModel = new RiskModel();
    this.arbModel = new ArbModel();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    await Promise.all([
      this.sentimentModel.initialize(),
      this.riskModel.initialize(),
      this.arbModel.loadModel()
    ]);
    this.initialized = true;
  }

  public async predictOpportunity(opportunity: ArbitrageOpportunity): Promise<AIPrediction> {
    await this.initialize();

    const arbInput = this.mapOpportunityToArbInput(opportunity);
    const arbPrediction = this.arbModel.predict(arbInput);
    const riskPrediction = await this.riskModel.assessRisk({
      volatility: opportunity.marketData?.volatility ?? 0.3,
      liquidity: opportunity.marketData?.liquidity ?? 0,
      volume: opportunity.marketData?.volume24h ?? 0,
      gasPrice: this.parseGas(opportunity.gasEstimate),
      priceDelta: opportunity.profitPercent ?? 0,
      competitionLevel: 0.5,
      historicalSuccessRate: 0.7
    });

    const sentiment = await this.sentimentModel.analyzeSentiment([
      opportunity.tokenA,
      opportunity.tokenB
    ]);

    const recommendedAction = this.toAction(arbPrediction);

    return {
      id: `pred_${Date.now()}`,
      opportunity: {
        probability: arbPrediction.successProb,
        expectedProfit: arbPrediction.expectedProfitPct,
        confidence: arbPrediction.successProb,
        recommendedAction
      },
      risk: {
        riskScore: riskPrediction.riskScore,
        volatility: riskPrediction.volatility,
        confidence: riskPrediction.confidence
      },
      sentiment: {
        overallSentiment: sentiment.overallSentiment,
        confidence: sentiment.confidence
      },
      confidence: (arbPrediction.successProb + riskPrediction.confidence + sentiment.confidence) / 3,
      timestamp: new Date().toISOString(),
      executionRecommendation: recommendedAction
    };
  }

  public async predictArb(input: ArbInput): Promise<ArbPrediction> {
    await this.initialize();
    return this.arbModel.predict(input);
  }

  public async analyzeSentiment(tokens: string[], sources?: string[]): Promise<any> {
    await this.initialize();
    return this.sentimentModel.analyzeSentiment(tokens, sources);
  }

  public async trainModel(trainingData: TrainingData[], modelType: string): Promise<void> {
    await this.initialize();
    logger.info('Training model', { modelType, dataPoints: trainingData.length });

    if (modelType === 'sentiment' || modelType === 'all') {
      await this.sentimentModel.train(trainingData);
    }

    if (modelType === 'risk' || modelType === 'all') {
      await this.riskModel.train(trainingData);
    }
  }

  public async getModelsStatus(): Promise<any> {
    await this.initialize();
    return {
      arb: {
        loaded: this.arbModel.isLoaded()
      },
      sentiment: await this.sentimentModel.getStatus(),
      risk: await this.riskModel.getStatus()
    };
  }

  public async submitFeedback(_feedback: ModelFeedback): Promise<void> {
    logger.info('Feedback received');
  }

  public async getCurrentOpportunities(_params?: { limit?: number; minProfit?: number }): Promise<ArbitrageOpportunity[]> {
    return [];
  }

  public async getPerformanceMetrics(timeframe: string): Promise<PerformanceMetrics> {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      totalPredictions: 0,
      successfulPredictions: 0,
      averageProfit: 0,
      averageGasUsed: 0,
      timeframe
    };
  }

  private mapOpportunityToArbInput(opportunity: ArbitrageOpportunity): ArbInput {
    return {
      profitPct: opportunity.profitPercent ?? 0,
      volumeUsd: opportunity.marketData?.volume24h ?? 0,
      liquidity: opportunity.marketData?.liquidity ?? 0,
      slippage: opportunity.marketData?.volatility ?? 0,
      gasPrice: this.parseGas(opportunity.gasEstimate)
    };
  }

  private parseGas(gasEstimate?: string): number {
    if (!gasEstimate) return 0;
    const parsed = Number(gasEstimate);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private toAction(prediction: ArbPrediction): 'EXECUTE' | 'WAIT' | 'AVOID' {
    if (prediction.successProb > 0.7 && prediction.expectedProfitPct > 0.5) {
      return 'EXECUTE';
    }
    if (prediction.successProb > 0.4) {
      return 'WAIT';
    }
    return 'AVOID';
  }
}
