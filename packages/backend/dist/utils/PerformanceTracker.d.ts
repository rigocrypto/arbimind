import { AIPrediction, ModelFeedback, PerformanceMetrics } from '../types';
export declare class PerformanceTracker {
    private predictions;
    private feedback;
    loadHistoricalData(): Promise<void>;
    trackPrediction(prediction: AIPrediction): Promise<void>;
    submitFeedback(feedback: ModelFeedback): Promise<void>;
    getFeedbackCount(): Promise<number>;
    getRecentFeedback(): Promise<ModelFeedback[]>;
    getMetrics(timeframe: string): Promise<PerformanceMetrics>;
    getStatus(): Promise<any>;
}
//# sourceMappingURL=PerformanceTracker.d.ts.map