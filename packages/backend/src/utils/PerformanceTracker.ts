import { logger } from './logger';
import { AIPrediction, ModelFeedback, PerformanceMetrics } from '../types';

export class PerformanceTracker {
  private predictions: AIPrediction[] = [];
  private feedback: ModelFeedback[] = [];

  public async loadHistoricalData(): Promise<void> {
    logger.info('Loading historical performance data...');
    // In a real implementation, this would load from a database
  }

  public async trackPrediction(prediction: AIPrediction): Promise<void> {
    this.predictions.push(prediction);
    // Keep only last 1000 predictions in memory
    if (this.predictions.length > 1000) {
      this.predictions.shift();
    }
  }

  public async submitFeedback(feedback: ModelFeedback): Promise<void> {
    this.feedback.push(feedback);
    // Keep only last 500 feedback entries in memory
    if (this.feedback.length > 500) {
      this.feedback.shift();
    }
  }

  public async getFeedbackCount(): Promise<number> {
    return this.feedback.length;
  }

  public async getRecentFeedback(): Promise<ModelFeedback[]> {
    return this.feedback.slice(-100);
  }

  public async getMetrics(timeframe: string): Promise<PerformanceMetrics> {
    // Simplified metrics calculation
    // In a real implementation, this would calculate from historical data
    const recentPredictions = this.predictions.slice(-100);
    const successful = recentPredictions.filter(p => 
      p.executionRecommendation.includes('EXECUTE')
    ).length;

    return {
      accuracy: successful / recentPredictions.length || 0,
      precision: 0.75,
      recall: 0.70,
      f1Score: 0.72,
      totalPredictions: recentPredictions.length,
      successfulPredictions: successful,
      averageProfit: 0.05,
      averageGasUsed: 150000,
      timeframe
    };
  }

  public async getStatus(): Promise<any> {
    return {
      totalPredictions: this.predictions.length,
      totalFeedback: this.feedback.length,
      lastUpdate: new Date().toISOString()
    };
  }
}

