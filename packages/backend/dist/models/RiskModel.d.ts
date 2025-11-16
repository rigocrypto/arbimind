import { TrainingData } from '../types';
export declare class RiskModel {
    private isInitialized;
    initialize(): Promise<void>;
    assessRisk(features: Record<string, number>): Promise<{
        riskScore: number;
        volatility: number;
        confidence: number;
    }>;
    train(trainingData: TrainingData[]): Promise<void>;
    getStatus(): Promise<any>;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=RiskModel.d.ts.map