import { TrainingData } from '../types';
export declare class SentimentModel {
    private isInitialized;
    initialize(): Promise<void>;
    analyzeSentiment(tokens: string[], sources?: string[]): Promise<{
        overallSentiment: number;
        confidence: number;
        sources: {
            twitter: number;
            reddit: number;
            news: number;
        };
        tokens: Record<string, number>;
    }>;
    train(trainingData: TrainingData[]): Promise<void>;
    getStatus(): Promise<any>;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=SentimentModel.d.ts.map