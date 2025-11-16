export interface AIModelConfig {
    opportunityDetection: {
        enabled: boolean;
        modelPath: string;
        confidenceThreshold: number;
        predictionWindow: number;
        retrainInterval: number;
        features: string[];
    };
    riskManagement: {
        enabled: boolean;
        modelPath: string;
        volatilityThreshold: number;
        anomalyDetectionSensitivity: number;
        dynamicSlippageEnabled: boolean;
        maxSlippageAdjustment: number;
    };
    executionOptimization: {
        enabled: boolean;
        modelPath: string;
        gasOptimizationEnabled: boolean;
        routeOptimizationEnabled: boolean;
        flashLoanThreshold: number;
    };
    sentimentAnalysis: {
        enabled: boolean;
        sources: string[];
        updateInterval: number;
        sentimentWeight: number;
    };
    training: {
        dataRetentionDays: number;
        batchSize: number;
        epochs: number;
        learningRate: number;
        validationSplit: number;
    };
}
export declare const AI_CONFIG: AIModelConfig;
export interface AIPrediction {
    opportunity: {
        probability: number;
        expectedProfit: number;
        confidence: number;
        riskScore: number;
        recommendedAction: 'execute' | 'wait' | 'skip';
    };
    risk: {
        volatilityScore: number;
        anomalyDetected: boolean;
        recommendedSlippage: number;
        gasPriceRecommendation: number;
    };
    execution: {
        optimalRoute: string[];
        recommendedGasLimit: number;
        useFlashLoan: boolean;
        executionPriority: 'high' | 'medium' | 'low';
    };
    sentiment: {
        overallSentiment: number;
        marketMood: 'bullish' | 'bearish' | 'neutral';
        confidence: number;
    };
}
export interface TrainingData {
    timestamp: number;
    features: Record<string, number>;
    target: {
        profit: number;
        success: boolean;
        gasUsed: number;
    };
    metadata: {
        tokenPair: string;
        dexes: string[];
        marketConditions: string;
    };
}
//# sourceMappingURL=config.d.ts.map