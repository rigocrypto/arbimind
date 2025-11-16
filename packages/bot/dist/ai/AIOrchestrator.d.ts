import { AIPrediction, TrainingData } from './config';
import { ArbitrageOpportunity } from '../types';
export declare class AIOrchestrator {
    private opportunityModel;
    private sentimentAnalyzer;
    private riskModel;
    private logger;
    private isInitialized;
    constructor();
    /**
     * Initialize all AI components
     */
    initialize(): Promise<void>;
    /**
     * Get comprehensive AI prediction for an arbitrage opportunity
     */
    getPrediction(opportunity: ArbitrageOpportunity): Promise<AIPrediction>;
    /**
     * Extract features from arbitrage opportunity
     */
    private extractFeatures;
    /**
     * Get opportunity prediction
     */
    private getOpportunityPrediction;
    /**
     * Get risk prediction
     */
    private getRiskPrediction;
    /**
     * Get sentiment prediction
     */
    private getSentimentPrediction;
    /**
     * Get execution optimization prediction
     */
    private getExecutionPrediction;
    /**
     * Train AI models with historical data
     */
    trainModels(trainingData: TrainingData[]): Promise<void>;
    /**
     * Update models with execution results
     */
    updateModels(executionResult: {
        success: boolean;
        actualProfit: number;
        expectedProfit: number;
        gasUsed: number;
        slippage: number;
        volatility: number;
    }): void;
    /**
     * Get AI system status
     */
    getStatus(): {
        isInitialized: boolean;
        opportunityModel: any;
        riskModel: any;
        sentimentAnalyzer: any;
    };
    private getDefaultPrediction;
    private getDefaultOpportunityPrediction;
    private getDefaultRiskPrediction;
    private getDefaultExecutionPrediction;
    private getDefaultSentimentPrediction;
}
//# sourceMappingURL=AIOrchestrator.d.ts.map