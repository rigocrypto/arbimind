export interface AIModelConfig {
  // Opportunity Detection Model
  opportunityDetection: {
    enabled: boolean;
    modelPath: string;
    confidenceThreshold: number;
    predictionWindow: number; // minutes
    retrainInterval: number; // hours
    features: string[];
  };
  
  // Risk Management Model
  riskManagement: {
    enabled: boolean;
    modelPath: string;
    volatilityThreshold: number;
    anomalyDetectionSensitivity: number;
    dynamicSlippageEnabled: boolean;
    maxSlippageAdjustment: number; // percentage
  };
  
  // Execution Optimization Model
  executionOptimization: {
    enabled: boolean;
    modelPath: string;
    gasOptimizationEnabled: boolean;
    routeOptimizationEnabled: boolean;
    flashLoanThreshold: number; // ETH
  };
  
  // Sentiment Analysis
  sentimentAnalysis: {
    enabled: boolean;
    sources: string[];
    updateInterval: number; // minutes
    sentimentWeight: number; // 0-1
  };
  
  // Training Configuration
  training: {
    dataRetentionDays: number;
    batchSize: number;
    epochs: number;
    learningRate: number;
    validationSplit: number;
  };
}

export const AI_CONFIG: AIModelConfig = {
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
    overallSentiment: number; // -1 to 1
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
