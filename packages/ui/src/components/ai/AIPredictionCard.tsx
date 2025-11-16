'use client';

import { useState } from 'react';
import { Brain, TrendingUp, AlertTriangle, Zap, Activity } from 'lucide-react';

interface AIPrediction {
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

interface AIPredictionCardProps {
  prediction: AIPrediction;
  tokenPair: string;
  isLoading?: boolean;
}

export default function AIPredictionCard({ prediction, tokenPair, isLoading = false }: AIPredictionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatEth = (value: number) => `${value.toFixed(6)} ETH`;
  const formatGwei = (value: number) => `${value.toFixed(0)} gwei`;

  const getActionColor = (action: string) => {
    switch (action) {
      case 'execute': return 'text-success-400';
      case 'wait': return 'text-warning-400';
      case 'skip': return 'text-red-400';
      default: return 'text-dark-300';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-success-400';
      case 'medium': return 'text-warning-400';
      case 'low': return 'text-red-400';
      default: return 'text-dark-300';
    }
  };

  const getSentimentColor = (sentiment: number) => {
    if (sentiment > 0.2) return 'text-success-400';
    if (sentiment < -0.2) return 'text-red-400';
    return 'text-dark-300';
  };

  if (isLoading) {
    return (
      <div className="card animate-pulse">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 bg-dark-600 rounded-lg"></div>
          <div className="flex-1">
            <div className="h-4 bg-dark-600 rounded w-1/2"></div>
            <div className="h-3 bg-dark-600 rounded w-1/3 mt-2"></div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-3 bg-dark-600 rounded"></div>
          <div className="h-3 bg-dark-600 rounded w-2/3"></div>
          <div className="h-3 bg-dark-600 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-purple-500 rounded-lg flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">AI Prediction</h3>
            <p className="text-sm text-dark-400">{tokenPair}</p>
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-dark-400 hover:text-white transition-colors"
        >
          {isExpanded ? '−' : '+'}
        </button>
      </div>

      {/* Main Prediction */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <p className="text-sm text-dark-400">Probability</p>
          <p className="text-2xl font-bold text-primary-400">
            {formatPercentage(prediction.opportunity.probability)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-dark-400">Expected Profit</p>
          <p className="text-2xl font-bold profit-positive">
            {formatEth(prediction.opportunity.expectedProfit)}
          </p>
        </div>
      </div>

      {/* Recommendation */}
      <div className="mb-4 p-3 bg-dark-700 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-dark-400">AI Recommendation</span>
          <span className={`font-semibold ${getActionColor(prediction.opportunity.recommendedAction)}`}>
            {prediction.opportunity.recommendedAction.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="space-y-4 pt-4 border-t border-dark-700">
          {/* Risk Assessment */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2 text-warning-500" />
              Risk Assessment
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-dark-400">Volatility:</span>
                <span className="ml-2">{formatPercentage(prediction.risk.volatilityScore)}</span>
              </div>
              <div>
                <span className="text-dark-400">Slippage:</span>
                <span className="ml-2">{prediction.risk.recommendedSlippage.toFixed(2)}%</span>
              </div>
              <div>
                <span className="text-dark-400">Gas Price:</span>
                <span className="ml-2">{formatGwei(prediction.risk.gasPriceRecommendation)}</span>
              </div>
              <div>
                <span className="text-dark-400">Anomaly:</span>
                <span className={`ml-2 ${prediction.risk.anomalyDetected ? 'text-red-400' : 'text-success-400'}`}>
                  {prediction.risk.anomalyDetected ? 'Detected' : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Execution Strategy */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center">
              <Zap className="w-4 h-4 mr-2 text-purple-500" />
              Execution Strategy
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-dark-400">Priority:</span>
                <span className={`ml-2 ${getPriorityColor(prediction.execution.executionPriority)}`}>
                  {prediction.execution.executionPriority.toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-dark-400">Gas Limit:</span>
                <span className="ml-2">{prediction.execution.recommendedGasLimit.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-dark-400">Flash Loan:</span>
                <span className={`ml-2 ${prediction.execution.useFlashLoan ? 'text-success-400' : 'text-dark-300'}`}>
                  {prediction.execution.useFlashLoan ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="text-dark-400">Route:</span>
                <span className="ml-2">{prediction.execution.optimalRoute.join(' → ')}</span>
              </div>
            </div>
          </div>

          {/* Market Sentiment */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center">
              <Activity className="w-4 h-4 mr-2 text-blue-500" />
              Market Sentiment
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-dark-400">Sentiment:</span>
                <span className={`ml-2 ${getSentimentColor(prediction.sentiment.overallSentiment)}`}>
                  {prediction.sentiment.marketMood}
                </span>
              </div>
              <div>
                <span className="text-dark-400">Confidence:</span>
                <span className="ml-2">{formatPercentage(prediction.sentiment.confidence)}</span>
              </div>
            </div>
          </div>

          {/* Confidence Metrics */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center">
              <TrendingUp className="w-4 h-4 mr-2 text-success-500" />
              Confidence Metrics
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">Prediction Confidence:</span>
                <span>{formatPercentage(prediction.opportunity.confidence)}</span>
              </div>
              <div className="w-full bg-dark-700 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-primary-500 to-success-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${prediction.opportunity.confidence * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
