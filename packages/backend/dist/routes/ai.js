"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAIService = setAIService;
const express_1 = __importDefault(require("express"));
const logger_1 = require("../utils/logger");
const validation_1 = require("../middleware/validation");
const aiSchemas_1 = require("../schemas/aiSchemas");
const router = express_1.default.Router();
let aiService;
function setAIService(service) {
    aiService = service;
}
router.post('/predict', (0, validation_1.validateRequest)(aiSchemas_1.predictionSchema), async (req, res) => {
    try {
        const { tokenA, tokenB, dex1, dex2, amountIn, priceData, orderBookData, marketData } = req.body;
        logger_1.logger.info('Processing AI prediction request', {
            tokenA,
            tokenB,
            dex1,
            dex2,
            amountIn
        });
        const prediction = await aiService.predictOpportunity({
            tokenA,
            tokenB,
            dex1,
            dex2,
            amountIn,
            priceData,
            orderBookData,
            marketData
        });
        res.json({
            success: true,
            data: prediction,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.logger.error('AI prediction failed', { error });
        res.status(500).json({
            success: false,
            message: 'AI prediction failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/sentiment', (0, validation_1.validateRequest)(aiSchemas_1.sentimentSchema), async (req, res) => {
    try {
        const { tokens, sources } = req.body;
        logger_1.logger.info('Processing sentiment analysis request', { tokens, sources });
        const sentiment = await aiService.analyzeSentiment(tokens, sources);
        res.json({
            success: true,
            data: sentiment,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.logger.error('Sentiment analysis failed', { error });
        res.status(500).json({
            success: false,
            message: 'Sentiment analysis failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/train', (0, validation_1.validateRequest)(aiSchemas_1.trainingDataSchema), async (req, res) => {
    try {
        const { trainingData, modelType } = req.body;
        logger_1.logger.info('Processing model training request', {
            dataPoints: trainingData.length,
            modelType
        });
        await aiService.trainModel(trainingData, modelType);
        res.json({
            success: true,
            message: 'Model training completed',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.logger.error('Model training failed', { error });
        res.status(500).json({
            success: false,
            message: 'Model training failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/models/status', async (req, res) => {
    try {
        const status = await aiService.getModelsStatus();
        res.json({
            success: true,
            data: status,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get models status', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to get models status',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/feedback', async (req, res) => {
    try {
        const { predictionId, actualOutcome, feedback, metadata } = req.body;
        logger_1.logger.info('Processing feedback submission', { predictionId });
        await aiService.submitFeedback({
            predictionId,
            actualOutcome,
            feedback,
            metadata
        });
        res.json({
            success: true,
            message: 'Feedback submitted successfully',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.logger.error('Feedback submission failed', { error });
        res.status(500).json({
            success: false,
            message: 'Feedback submission failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/opportunities', async (req, res) => {
    try {
        const { limit = 10, minProfit = 0.01 } = req.query;
        const opportunities = await aiService.getCurrentOpportunities({
            limit: parseInt(limit),
            minProfit: parseFloat(minProfit)
        });
        res.json({
            success: true,
            data: opportunities,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get opportunities', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to get opportunities',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/performance', async (req, res) => {
    try {
        const { timeframe = '24h' } = req.query;
        const performance = await aiService.getPerformanceMetrics(timeframe);
        res.json({
            success: true,
            data: performance,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get performance metrics', { error });
        res.status(500).json({
            success: false,
            message: 'Failed to get performance metrics',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=ai.js.map