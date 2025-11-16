import { TrainingData } from '../types';
export declare class PredictionModel {
    private isInitialized;
    initialize(): Promise<void>;
    predict(features: Record<string, number>): Promise<{
        probability: number;
        expectedProfit: number;
        confidence: number;
        recommendedAction: 'EXECUTE' | 'WAIT' | 'AVOID';
    }>;
    train(trainingData: TrainingData[]): Promise<void>;
    getStatus(): Promise<any>;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=PredictionModel.d.ts.map