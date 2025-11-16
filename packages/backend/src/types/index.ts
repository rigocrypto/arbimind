// Core types for ArbiMind AI Backend

export interface ArbitrageOpportunity {
  tokenA: string;
  tokenB: string;
  dex1: string;
  dex2: string;
  amountIn: string;
  profit?: string;
  profitPercent?: number;
  gasEstimate?: string;
  priceData?: PriceData;
  orderBookData?: OrderBookData;
  marketData?: MarketData;
}

export interface AIPrediction {
  id: string;
  opportunity: {
    probability: number;
    expectedProfit: number;
    confidence: number;
    recommendedAction: 'EXECUTE' | 'WAIT' | 'AVOID';
  };
  risk: {
    riskScore: number;
    volatility: number;
    confidence: number;
  };
  sentiment: {
    overallSentiment: number;
    confidence: number;
  };
  confidence: number;
  timestamp: string;
  executionRecommendation: string;
}

export interface SentimentAnalysis {
  overallSentiment: number; // -1 to 1
  confidence: number; // 0 to 1
  sources: {
    twitter: number;
    reddit: number;
    news: number;
  };
  tokens: Record<string, number>;
}

export interface TrainingData {
  input: Record<string, number>;
  output: {
    success: boolean;
    profit: number;
    gasUsed: number;
  };
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface ModelFeedback {
  predictionId: string;
  actualOutcome: {
    success: boolean;
    profit: number;
    gasUsed: number;
  };
  feedback: string;
  metadata?: Record<string, any>;
}

export interface PerformanceMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  totalPredictions: number;
  successfulPredictions: number;
  averageProfit: number;
  averageGasUsed: number;
  timeframe: string;
}

export interface PriceData {
  token: string;
  price: number;
  timestamp: string;
  source: string;
}

export interface OrderBookData {
  token: string;
  bids: Array<{ price: number; amount: number }>;
  asks: Array<{ price: number; amount: number }>;
  timestamp: string;
}

export interface MarketData {
  volume24h: number;
  marketCap: number;
  volatility: number;
  liquidity: number;
  timestamp: string;
}

export interface WebSocketMessage {
  type: 'prediction' | 'opportunity' | 'sentiment' | 'performance';
  data: any;
  timestamp: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    ai: boolean;
    data: boolean;
    websocket: boolean;
  };
  uptime: number;
  timestamp: string;
}

export interface Metrics {
  predictionsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
  memoryUsage: number;
  cpuUsage: number;
  timestamp: string;
}



