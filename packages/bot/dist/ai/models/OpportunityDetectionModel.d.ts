import { AIPrediction, TrainingData } from '../config';
export declare class OpportunityDetectionModel {
    private model;
    private logger;
    private isTraining;
    private lastTrainingTime;
    constructor();
    /**
     * Initialize the model
     */
    initialize(): Promise<void>;
    /**
     * Predict opportunity probability for given features
     */
    predict(features: Record<string, number>): Promise<AIPrediction['opportunity']>;
    /**
     * Train the model with historical data
     */
    train(trainingData: TrainingData[]): Promise<void>;
    /**
     * Save the trained model
     */
    saveModel(path: string): Promise<void>;
    /**
     * Load a trained model
     */
    loadModel(path: string): Promise<void>;
    /**
     * Normalize features for model input
     */
    private normalizeFeatures;
    /**
     * Prepare training data from historical records
     */
    private prepareTrainingData;
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
     * Get model status
     */
    getStatus(): {
        isInitialized: boolean;
        isTraining: boolean;
        lastTrainingTime: number;
    };
}
//# sourceMappingURL=OpportunityDetectionModel.d.ts.map