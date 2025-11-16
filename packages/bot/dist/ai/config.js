"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_CONFIG = void 0;
exports.AI_CONFIG = {
    opportunityDetection: {
        enabled: true,
        modelPath: './models/opportunity_detection',
        confidenceThreshold: 0.75,
        predictionWindow: 5, // 5 minutes
        retrainInterval: 24, // 24 hours
        features: [
            'price_delta',
            'liquidity_ratio',
            'volume_24h',
            'gas_price',
            'volatility',
            'market_sentiment',
            'competition_level',
            'historical_success_rate'
        ]
    },
    riskManagement: {
        enabled: true,
        modelPath: './models/risk_management',
        volatilityThreshold: 0.15,
        anomalyDetectionSensitivity: 0.8,
        dynamicSlippageEnabled: true,
        maxSlippageAdjustment: 0.5 // 0.5%
    },
    executionOptimization: {
        enabled: true,
        modelPath: './models/execution_optimization',
        gasOptimizationEnabled: true,
        routeOptimizationEnabled: true,
        flashLoanThreshold: 0.1 // 0.1 ETH
    },
    sentimentAnalysis: {
        enabled: true,
        sources: [
            'twitter',
            'reddit',
            'news',
            'telegram'
        ],
        updateInterval: 5, // 5 minutes
        sentimentWeight: 0.3
    },
    training: {
        dataRetentionDays: 30,
        batchSize: 32,
        epochs: 100,
        learningRate: 0.001,
        validationSplit: 0.2
    }
};
//# sourceMappingURL=config.js.map