import { ArbitrageOpportunity, AIPrediction, SentimentAnalysis, TrainingData, ModelFeedback, PerformanceMetrics } from '../types';
export declare class AIService {
    private predictionModel;
    private sentimentModel;
    private riskModel;
    private performanceTracker;
    private isInitialized;
    constructor();
    initialize(): Promise<void>;
    predictOpportunity(opportunity: ArbitrageOpportunity): Promise<AIPrediction>;
    analyzeSentiment(tokens: string[], sources?: string[]): Promise<SentimentAnalysis>;
    trainModel(trainingData: TrainingData[], modelType: string): Promise<void>;
    getModelsStatus(): Promise<any>;
    submitFeedback(feedback: ModelFeedback): Promise<void>;
    getCurrentOpportunities(options: {
        limit: number;
        minProfit: number;
    }): Promise<ArbitrageOpportunity[]>;
    getPerformanceMetrics(timeframe: string): Promise<PerformanceMetrics>;
    startModelRetraining(): void;
    shutdown(): Promise<void>;
    private extractFeatures;
    private calculateOverallConfidence;
    private generateExecutionRecommendation;
    private generatePredictionId;
    private getFallbackPrediction;
    private triggerModelRetraining;
    private estimateLiquidity;
    private estimateVolume;
    private estimateVolatility;
    private estimateCompetition;
    private generateMockOpportunities;
}
//# sourceMappingURL=AIService.d.ts.map