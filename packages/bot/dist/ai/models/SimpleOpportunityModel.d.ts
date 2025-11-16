import { AIPrediction, TrainingData } from '../config';
export declare class SimpleOpportunityModel {
    private logger;
    private isTraining;
    private lastTrainingTime;
    private historicalData;
    constructor();
    /**
     * Initialize the model
     */
    initialize(): Promise<void>;
    /**
     * Predict opportunity probability using rule-based logic
     */
    predict(features: Record<string, number>): Promise<AIPrediction['opportunity']>;
    /**
     * Calculate opportunity score using rule-based logic
     */
    private calculateOpportunityScore;
    /**
     * Calculate prediction confidence
     */
    private calculateConfidence;
    /**
     * Calculate risk score
     */
    private calculateRiskScore;
    /**
     * Estimate expected profit
     */
    private estimateExpectedProfit;
    /**
     * Determine recommended action
     */
    private determineAction;
    /**
     * Train the model with historical data (simplified)
     */
    train(trainingData: TrainingData[]): Promise<void>;
    /**
     * Analyze patterns in historical data
     */
    private analyzeHistoricalPatterns;
    /**
     * Save the model (simplified - just save configuration)
     */
    saveModel(path: string): Promise<void>;
    /**
     * Load a trained model (simplified)
     */
    loadModel(path: string): Promise<void>;
    /**
     * Get model status
     */
    getStatus(): {
        isInitialized: boolean;
        isTraining: boolean;
        lastTrainingTime: number;
        dataPoints: number;
    };
}
//# sourceMappingURL=SimpleOpportunityModel.d.ts.map