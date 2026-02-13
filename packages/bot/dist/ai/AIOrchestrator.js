"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIOrchestrator = void 0;
const config_1 = require("./config");
const SimpleOpportunityModel_1 = require("./models/SimpleOpportunityModel");
const SentimentAnalyzer_1 = require("./predictors/SentimentAnalyzer");
const RiskManagementModel_1 = require("./risk/RiskManagementModel");
const Logger_1 = require("../utils/Logger");
class AIOrchestrator {
    opportunityModel;
    sentimentAnalyzer;
    riskModel;
    logger;
    isInitialized = false;
    constructor() {
        this.opportunityModel = new SimpleOpportunityModel_1.SimpleOpportunityModel();
        this.sentimentAnalyzer = new SentimentAnalyzer_1.SentimentAnalyzer();
        this.riskModel = new RiskManagementModel_1.RiskManagementModel();
        this.logger = new Logger_1.Logger('AIOrchestrator');
    }
    /**
     * Initialize all AI components
     */
    async initialize() {
        try {
            this.logger.info('Initializing AI orchestrator...');
            // Initialize opportunity detection model
            if (config_1.AI_CONFIG.opportunityDetection.enabled) {
                await this.opportunityModel.initialize();
                this.logger.info('Opportunity detection model initialized');
            }
            this.isInitialized = true;
            this.logger.info('AI orchestrator initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize AI orchestrator', {
                error: error instanceof Error ? error.message : error
            });
            throw error;
        }
    }
    /**
     * Get comprehensive AI prediction for an arbitrage opportunity
     */
    async getPrediction(opportunity) {
        if (!this.isInitialized) {
            throw new Error('AI orchestrator not initialized');
        }
        try {
            this.logger.debug('Generating AI prediction for opportunity', {
                tokenA: opportunity.tokenA,
                tokenB: opportunity.tokenB,
                dex1: opportunity.dex1,
                dex2: opportunity.dex2
            });
            // Extract features for AI models
            const features = await this.extractFeatures(opportunity);
            // Get predictions from all AI components
            const [opportunityPrediction, riskPrediction, sentimentPrediction] = await Promise.all([
                this.getOpportunityPrediction(features),
                this.getRiskPrediction(features),
                this.getSentimentPrediction(opportunity.tokenA, opportunity.tokenB)
            ]);
            // Get execution optimization
            const executionPrediction = this.getExecutionPrediction(opportunity, features);
            const prediction = {
                opportunity: opportunityPrediction,
                risk: riskPrediction,
                execution: executionPrediction,
                sentiment: sentimentPrediction
            };
            this.logger.debug('AI prediction generated', {
                opportunityProbability: opportunityPrediction.probability,
                riskScore: riskPrediction.volatilityScore,
                recommendedAction: opportunityPrediction.recommendedAction
            });
            return prediction;
        }
        catch (error) {
            this.logger.error('Failed to generate AI prediction', {
                error: error instanceof Error ? error.message : error
            });
            // Return default prediction
            return this.getDefaultPrediction();
        }
    }
    /**
     * Extract features from arbitrage opportunity
     */
    async extractFeatures(opportunity) {
        const priceDelta = parseFloat(opportunity.profit) / parseFloat(opportunity.amountIn);
        const profitPercent = opportunity.profitPercent;
        // Calculate volatility (simplified)
        const volatility = Math.abs(profitPercent) / 100;
        // Estimate competition level based on gas price and profit
        const competitionLevel = Math.min(parseFloat(opportunity.gasEstimate) / 1000000, 10);
        // Estimate liquidity (simplified)
        const liquidity = parseFloat(opportunity.amountIn) * 1000; // Rough estimate
        // Estimate volume (simplified)
        const volume = liquidity * 10; // Rough estimate
        // Get current gas price (simplified)
        const gasPrice = 20; // Default 20 gwei
        // Historical success rate (simplified)
        const historicalSuccessRate = 0.7; // 70% default
        return {
            price_delta: priceDelta,
            liquidity_ratio: liquidity,
            volume_24h: volume,
            gas_price: gasPrice,
            volatility,
            market_sentiment: 0, // Will be updated by sentiment analysis
            competition_level: competitionLevel,
            historical_success_rate: historicalSuccessRate
        };
    }
    /**
     * Get opportunity prediction
     */
    async getOpportunityPrediction(features) {
        if (!config_1.AI_CONFIG.opportunityDetection.enabled) {
            return this.getDefaultOpportunityPrediction();
        }
        try {
            return await this.opportunityModel.predict(features);
        }
        catch (error) {
            this.logger.error('Opportunity prediction failed', {
                error: error instanceof Error ? error.message : error
            });
            return this.getDefaultOpportunityPrediction();
        }
    }
    /**
     * Get risk prediction
     */
    async getRiskPrediction(features) {
        if (!config_1.AI_CONFIG.riskManagement.enabled) {
            return this.getDefaultRiskPrediction();
        }
        try {
            return await this.riskModel.assessRisk({
                priceDelta: features['price_delta'] || 0,
                liquidity: features['liquidity_ratio'] || 0,
                volume: features['volume_24h'] || 0,
                gasPrice: features['gas_price'] || 0,
                volatility: features['volatility'] || 0,
                competitionLevel: features['competition_level'] || 0,
                historicalSuccessRate: features['historical_success_rate'] || 0
            });
        }
        catch (error) {
            this.logger.error('Risk prediction failed', {
                error: error instanceof Error ? error.message : error
            });
            return this.getDefaultRiskPrediction();
        }
    }
    /**
     * Get sentiment prediction
     */
    async getSentimentPrediction(tokenA, tokenB) {
        if (!config_1.AI_CONFIG.sentimentAnalysis.enabled) {
            return this.getDefaultSentimentPrediction();
        }
        try {
            // Get sentiment for both tokens and average them
            const [sentimentA, sentimentB] = await Promise.all([
                this.sentimentAnalyzer.analyzeSentiment(tokenA),
                this.sentimentAnalyzer.analyzeSentiment(tokenB)
            ]);
            const averageSentiment = (sentimentA.overallSentiment + sentimentB.overallSentiment) / 2;
            const averageConfidence = (sentimentA.confidence + sentimentB.confidence) / 2;
            // Determine overall market mood
            let marketMood;
            if (averageSentiment > 0.2) {
                marketMood = 'bullish';
            }
            else if (averageSentiment < -0.2) {
                marketMood = 'bearish';
            }
            else {
                marketMood = 'neutral';
            }
            return {
                overallSentiment: averageSentiment,
                marketMood,
                confidence: averageConfidence
            };
        }
        catch (error) {
            this.logger.error('Sentiment prediction failed', {
                error: error instanceof Error ? error.message : error
            });
            return this.getDefaultSentimentPrediction();
        }
    }
    /**
     * Get execution optimization prediction
     */
    getExecutionPrediction(opportunity, features) {
        if (!config_1.AI_CONFIG.executionOptimization.enabled) {
            return this.getDefaultExecutionPrediction();
        }
        try {
            // Determine optimal route
            const optimalRoute = [opportunity.dex1, opportunity.dex2];
            // Calculate recommended gas limit
            const baseGasLimit = 300000;
            const volatilityAdjustment = (features['volatility'] || 0) * 50000;
            const recommendedGasLimit = Math.min(baseGasLimit + volatilityAdjustment, 500000);
            // Determine if flash loan should be used
            const amountInEth = parseFloat(opportunity.amountIn) / 1e18;
            const useFlashLoan = amountInEth > config_1.AI_CONFIG.executionOptimization.flashLoanThreshold;
            // Determine execution priority
            let executionPriority;
            if ((features['price_delta'] || 0) > 0.05 && (features['volatility'] || 0) < 0.1) {
                executionPriority = 'high';
            }
            else if ((features['price_delta'] || 0) > 0.02 && (features['volatility'] || 0) < 0.2) {
                executionPriority = 'medium';
            }
            else {
                executionPriority = 'low';
            }
            return {
                optimalRoute,
                recommendedGasLimit,
                useFlashLoan,
                executionPriority
            };
        }
        catch (error) {
            this.logger.error('Execution prediction failed', {
                error: error instanceof Error ? error.message : error
            });
            return this.getDefaultExecutionPrediction();
        }
    }
    /**
     * Train AI models with historical data
     */
    async trainModels(trainingData) {
        try {
            this.logger.info('Starting AI model training...', { dataPoints: trainingData.length });
            if (config_1.AI_CONFIG.opportunityDetection.enabled) {
                await this.opportunityModel.train(trainingData);
            }
            this.logger.info('AI model training completed');
        }
        catch (error) {
            this.logger.error('AI model training failed', {
                error: error instanceof Error ? error.message : error
            });
        }
    }
    /**
     * Update models with execution results
     */
    updateModels(executionResult) {
        try {
            this.riskModel.updateModel(executionResult);
            this.logger.debug('AI models updated with execution result');
        }
        catch (error) {
            this.logger.error('Failed to update AI models', {
                error: error instanceof Error ? error.message : error
            });
        }
    }
    /**
     * Get AI system status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            opportunityModel: this.opportunityModel.getStatus(),
            riskModel: this.riskModel.getModelStats(),
            sentimentAnalyzer: this.sentimentAnalyzer.getCacheStats()
        };
    }
    // Default prediction methods
    getDefaultPrediction() {
        return {
            opportunity: this.getDefaultOpportunityPrediction(),
            risk: this.getDefaultRiskPrediction(),
            execution: this.getDefaultExecutionPrediction(),
            sentiment: this.getDefaultSentimentPrediction()
        };
    }
    getDefaultOpportunityPrediction() {
        return {
            probability: 0.5,
            expectedProfit: 0,
            confidence: 0.5,
            riskScore: 0.5,
            recommendedAction: 'wait'
        };
    }
    getDefaultRiskPrediction() {
        return {
            volatilityScore: 0.5,
            anomalyDetected: false,
            recommendedSlippage: 1.0,
            gasPriceRecommendation: 20
        };
    }
    getDefaultExecutionPrediction() {
        return {
            optimalRoute: [],
            recommendedGasLimit: 300000,
            useFlashLoan: false,
            executionPriority: 'medium'
        };
    }
    getDefaultSentimentPrediction() {
        return {
            overallSentiment: 0,
            marketMood: 'neutral',
            confidence: 0.5
        };
    }
}
exports.AIOrchestrator = AIOrchestrator;
