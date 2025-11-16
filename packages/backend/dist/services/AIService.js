"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const logger_1 = require("../utils/logger");
const PredictionModel_1 = require("../models/PredictionModel");
const SentimentModel_1 = require("../models/SentimentModel");
const RiskModel_1 = require("../models/RiskModel");
const PerformanceTracker_1 = require("../utils/PerformanceTracker");
class AIService {
    constructor() {
        this.isInitialized = false;
        this.predictionModel = new PredictionModel_1.PredictionModel();
        this.sentimentModel = new SentimentModel_1.SentimentModel();
        this.riskModel = new RiskModel_1.RiskModel();
        this.performanceTracker = new PerformanceTracker_1.PerformanceTracker();
    }
    async initialize() {
        try {
            logger_1.logger.info('Initializing AI Service...');
            await this.predictionModel.initialize();
            logger_1.logger.info('Prediction model initialized');
            await this.sentimentModel.initialize();
            logger_1.logger.info('Sentiment model initialized');
            await this.riskModel.initialize();
            logger_1.logger.info('Risk model initialized');
            await this.performanceTracker.loadHistoricalData();
            logger_1.logger.info('Performance tracker initialized');
            this.isInitialized = true;
            logger_1.logger.info('AI Service initialized successfully');
        }
        catch (error) {
            logger_1.logger.error('Failed to initialize AI Service', { error });
            throw error;
        }
    }
    async predictOpportunity(opportunity) {
        if (!this.isInitialized) {
            throw new Error('AI Service not initialized');
        }
        try {
            const startTime = Date.now();
            logger_1.logger.debug('Generating AI prediction', {
                tokenA: opportunity.tokenA,
                tokenB: opportunity.tokenB,
                dex1: opportunity.dex1,
                dex2: opportunity.dex2
            });
            const features = await this.extractFeatures(opportunity);
            const [opportunityPrediction, riskAssessment, sentimentAnalysis] = await Promise.all([
                this.predictionModel.predict(features),
                this.riskModel.assessRisk(features),
                this.sentimentModel.analyzeSentiment([opportunity.tokenA, opportunity.tokenB])
            ]);
            const prediction = {
                id: this.generatePredictionId(),
                opportunity: opportunityPrediction,
                risk: riskAssessment,
                sentiment: sentimentAnalysis,
                confidence: this.calculateOverallConfidence(opportunityPrediction, riskAssessment, sentimentAnalysis),
                timestamp: new Date().toISOString(),
                executionRecommendation: this.generateExecutionRecommendation(opportunityPrediction, riskAssessment, sentimentAnalysis)
            };
            await this.performanceTracker.trackPrediction(prediction);
            const processingTime = Date.now() - startTime;
            logger_1.logger.debug('AI prediction generated', {
                predictionId: prediction.id,
                confidence: prediction.confidence,
                processingTime: `${processingTime}ms`
            });
            return prediction;
        }
        catch (error) {
            logger_1.logger.error('AI prediction failed', { error });
            return this.getFallbackPrediction(opportunity);
        }
    }
    async analyzeSentiment(tokens, sources = ['twitter', 'reddit', 'news']) {
        if (!this.isInitialized) {
            throw new Error('AI Service not initialized');
        }
        try {
            logger_1.logger.debug('Analyzing sentiment', { tokens, sources });
            const sentiment = await this.sentimentModel.analyzeSentiment(tokens, sources);
            logger_1.logger.debug('Sentiment analysis completed', {
                tokens,
                overallSentiment: sentiment.overallSentiment,
                confidence: sentiment.confidence
            });
            return sentiment;
        }
        catch (error) {
            logger_1.logger.error('Sentiment analysis failed', { error });
            throw error;
        }
    }
    async trainModel(trainingData, modelType) {
        if (!this.isInitialized) {
            throw new Error('AI Service not initialized');
        }
        try {
            logger_1.logger.info('Starting model training', {
                dataPoints: trainingData.length,
                modelType
            });
            switch (modelType) {
                case 'prediction':
                    await this.predictionModel.train(trainingData);
                    break;
                case 'sentiment':
                    await this.sentimentModel.train(trainingData);
                    break;
                case 'risk':
                    await this.riskModel.train(trainingData);
                    break;
                case 'all':
                    await Promise.all([
                        this.predictionModel.train(trainingData),
                        this.sentimentModel.train(trainingData),
                        this.riskModel.train(trainingData)
                    ]);
                    break;
                default:
                    throw new Error(`Unknown model type: ${modelType}`);
            }
            logger_1.logger.info('Model training completed', { modelType });
        }
        catch (error) {
            logger_1.logger.error('Model training failed', { error });
            throw error;
        }
    }
    async getModelsStatus() {
        try {
            const [predictionStatus, sentimentStatus, riskStatus, performanceStatus] = await Promise.all([
                this.predictionModel.getStatus(),
                this.sentimentModel.getStatus(),
                this.riskModel.getStatus(),
                this.performanceTracker.getStatus()
            ]);
            return {
                isInitialized: this.isInitialized,
                models: {
                    prediction: predictionStatus,
                    sentiment: sentimentStatus,
                    risk: riskStatus
                },
                performance: performanceStatus
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get models status', { error });
            throw error;
        }
    }
    async submitFeedback(feedback) {
        try {
            logger_1.logger.info('Processing model feedback', { predictionId: feedback.predictionId });
            await this.performanceTracker.submitFeedback(feedback);
            const feedbackCount = await this.performanceTracker.getFeedbackCount();
            if (feedbackCount > 100) {
                await this.triggerModelRetraining();
            }
            logger_1.logger.info('Feedback processed successfully', { predictionId: feedback.predictionId });
        }
        catch (error) {
            logger_1.logger.error('Failed to process feedback', { error });
            throw error;
        }
    }
    async getCurrentOpportunities(options) {
        try {
            return this.generateMockOpportunities(options);
        }
        catch (error) {
            logger_1.logger.error('Failed to get opportunities', { error });
            throw error;
        }
    }
    async getPerformanceMetrics(timeframe) {
        try {
            return await this.performanceTracker.getMetrics(timeframe);
        }
        catch (error) {
            logger_1.logger.error('Failed to get performance metrics', { error });
            throw error;
        }
    }
    startModelRetraining() {
        setInterval(async () => {
            try {
                await this.triggerModelRetraining();
            }
            catch (error) {
                logger_1.logger.error('Scheduled model retraining failed', { error });
            }
        }, 24 * 60 * 60 * 1000);
    }
    async shutdown() {
        try {
            logger_1.logger.info('Shutting down AI Service...');
            await Promise.all([
                this.predictionModel.shutdown(),
                this.sentimentModel.shutdown(),
                this.riskModel.shutdown()
            ]);
            logger_1.logger.info('AI Service shutdown complete');
        }
        catch (error) {
            logger_1.logger.error('AI Service shutdown failed', { error });
        }
    }
    async extractFeatures(opportunity) {
        const profit = opportunity.profit || '0';
        const profitPercent = opportunity.profitPercent || 0;
        const gasEstimate = opportunity.gasEstimate || '100000';
        const priceDelta = parseFloat(profit) / parseFloat(opportunity.amountIn) || 0;
        return {
            price_delta: priceDelta,
            profit_percent: profitPercent,
            amount_in: parseFloat(opportunity.amountIn),
            gas_estimate: parseFloat(gasEstimate),
            liquidity_ratio: this.estimateLiquidity(opportunity),
            volume_24h: this.estimateVolume(opportunity),
            volatility: this.estimateVolatility(opportunity),
            competition_level: this.estimateCompetition(opportunity)
        };
    }
    calculateOverallConfidence(opportunity, risk, sentiment) {
        const weights = { opportunity: 0.5, risk: 0.3, sentiment: 0.2 };
        return (opportunity.confidence * weights.opportunity +
            risk.confidence * weights.risk +
            sentiment.confidence * weights.sentiment);
    }
    generateExecutionRecommendation(opportunity, risk, sentiment) {
        if (opportunity.probability > 0.8 && risk.riskScore < 0.3 && sentiment.overallSentiment > 0.2) {
            return 'EXECUTE_HIGH_CONFIDENCE';
        }
        else if (opportunity.probability > 0.6 && risk.riskScore < 0.5) {
            return 'EXECUTE_MEDIUM_CONFIDENCE';
        }
        else if (risk.riskScore > 0.7) {
            return 'AVOID_HIGH_RISK';
        }
        else {
            return 'WAIT_FOR_BETTER_OPPORTUNITY';
        }
    }
    generatePredictionId() {
        return `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    getFallbackPrediction(opportunity) {
        return {
            id: this.generatePredictionId(),
            opportunity: {
                probability: 0.5,
                expectedProfit: 0,
                confidence: 0.3,
                recommendedAction: 'WAIT'
            },
            risk: {
                riskScore: 0.5,
                volatility: 0.5,
                confidence: 0.3
            },
            sentiment: {
                overallSentiment: 0,
                confidence: 0.3
            },
            confidence: 0.3,
            timestamp: new Date().toISOString(),
            executionRecommendation: 'WAIT_FOR_BETTER_OPPORTUNITY'
        };
    }
    async triggerModelRetraining() {
        try {
            logger_1.logger.info('Triggering model retraining...');
            const recentFeedback = await this.performanceTracker.getRecentFeedback();
            if (recentFeedback.length > 50) {
                const trainingData = recentFeedback.map((f) => ({
                    input: {},
                    output: {
                        success: f.actualOutcome.success,
                        profit: f.actualOutcome.profit,
                        gasUsed: f.actualOutcome.gasUsed
                    },
                    timestamp: new Date().toISOString(),
                    metadata: f.metadata || {}
                }));
                await this.trainModel(trainingData, 'all');
                logger_1.logger.info('Model retraining completed');
            }
        }
        catch (error) {
            logger_1.logger.error('Model retraining failed', { error });
        }
    }
    estimateLiquidity(opportunity) {
        return parseFloat(opportunity.amountIn) * 1000;
    }
    estimateVolume(opportunity) {
        return parseFloat(opportunity.amountIn) * 10000;
    }
    estimateVolatility(opportunity) {
        return Math.abs(opportunity.profitPercent || 0) / 100;
    }
    estimateCompetition(opportunity) {
        const gasEstimate = opportunity.gasEstimate || '100000';
        return Math.min(parseFloat(gasEstimate) / 1000000, 10);
    }
    generateMockOpportunities(options) {
        const opportunities = [];
        const tokens = ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC'];
        const dexes = ['UniswapV2', 'UniswapV3', 'SushiSwap', 'Balancer'];
        for (let i = 0; i < options.limit; i++) {
            const tokenA = tokens[Math.floor(Math.random() * tokens.length)];
            const tokenB = tokens[Math.floor(Math.random() * tokens.length)];
            if (tokenA === tokenB)
                continue;
            const dex1 = dexes[Math.floor(Math.random() * dexes.length)];
            const dex2 = dexes[Math.floor(Math.random() * dexes.length)];
            if (dex1 === dex2)
                continue;
            const amountIn = (Math.random() * 10 + 1).toFixed(6);
            const profit = (Math.random() * 0.1 + options.minProfit).toFixed(6);
            const profitPercent = (parseFloat(profit) / parseFloat(amountIn) * 100).toFixed(2);
            opportunities.push({
                tokenA,
                tokenB,
                dex1,
                dex2,
                amountIn,
                profit,
                profitPercent: parseFloat(profitPercent),
                gasEstimate: (Math.random() * 200000 + 100000).toFixed(0)
            });
        }
        return opportunities;
    }
}
exports.AIService = AIService;
//# sourceMappingURL=AIService.js.map