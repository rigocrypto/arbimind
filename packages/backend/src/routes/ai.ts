import express from 'express';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { AIService } from '../services/AIService';
import { validateRequest } from '../middleware/validation';
import { 
  predictionSchema, 
  sentimentSchema, 
  trainingDataSchema,
  arbPredictionSchema
} from '../schemas/aiSchemas';

const router = express.Router();

// Get aiService from the exported instance
let aiService: AIService;

export function setAIService(service: AIService) {
  aiService = service;
}

/**
 * @route POST /api/ai/predict
 * @desc Get AI prediction for arbitrage opportunity
 * @access Private
 */
router.post('/predict', validateRequest(predictionSchema), async (req: Request, res: Response) => {
  try {
    const { 
      tokenA, 
      tokenB, 
      dex1, 
      dex2, 
      amountIn, 
      priceData, 
      orderBookData,
      marketData 
    } = req.body;

    logger.info('Processing AI prediction request', {
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

  } catch (error) {
    logger.error('AI prediction failed', { error });
    res.status(500).json({
      success: false,
      message: 'AI prediction failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route POST /api/ai/predict-arb
 * @desc Predict arb opportunity success/profit
 * @access Private
 */
router.post('/predict-arb', validateRequest(arbPredictionSchema), async (req: Request, res: Response) => {
  try {
    const { profitPct, volumeUsd, liquidity, slippage, gasPrice } = req.body;

    const prediction = await aiService.predictArb({
      profitPct,
      volumeUsd,
      liquidity,
      slippage,
      gasPrice
    });

    const recommendation = prediction.successProb > 0.7 && prediction.expectedProfitPct > 0.5
      ? 'EXECUTE'
      : prediction.successProb > 0.4
        ? 'WAIT'
        : 'AVOID';

    res.json({
      success: true,
      data: {
        expectedProfitPct: prediction.expectedProfitPct,
        successProb: prediction.successProb,
        recommendation
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Arb prediction failed', { error });
    res.status(500).json({
      success: false,
      message: 'Arb prediction failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route POST /api/ai/sentiment
 * @desc Analyze market sentiment for tokens
 * @access Private
 */
router.post('/sentiment', validateRequest(sentimentSchema), async (req: Request, res: Response) => {
  try {
    const { tokens, sources } = req.body;

    logger.info('Processing sentiment analysis request', { tokens, sources });

    const sentiment = await aiService.analyzeSentiment(tokens, sources);

    res.json({
      success: true,
      data: sentiment,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Sentiment analysis failed', { error });
    res.status(500).json({
      success: false,
      message: 'Sentiment analysis failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route POST /api/ai/train
 * @desc Train AI models with new data
 * @access Private
 */
router.post('/train', validateRequest(trainingDataSchema), async (req: Request, res: Response) => {
  try {
    const { trainingData, modelType } = req.body;

    logger.info('Processing model training request', { 
      dataPoints: trainingData.length,
      modelType 
    });

    await aiService.trainModel(trainingData, modelType);

    res.json({
      success: true,
      message: 'Model training completed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Model training failed', { error });
    res.status(500).json({
      success: false,
      message: 'Model training failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route GET /api/ai/models/status
 * @desc Get AI models status and performance metrics
 * @access Private
 */
router.get('/models/status', async (req: Request, res: Response) => {
  try {
    const status = await aiService.getModelsStatus();

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get models status', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to get models status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route POST /api/ai/feedback
 * @desc Submit feedback for model improvement
 * @access Private
 */
router.post('/feedback', async (req: Request, res: Response) => {
  try {
    const { 
      predictionId, 
      actualOutcome, 
      feedback, 
      metadata 
    } = req.body;

    logger.info('Processing feedback submission', { predictionId });

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

  } catch (error) {
    logger.error('Feedback submission failed', { error });
    res.status(500).json({
      success: false,
      message: 'Feedback submission failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route GET /api/ai/opportunities
 * @desc Get current arbitrage opportunities
 * @access Private
 */
router.get('/opportunities', async (req: Request, res: Response) => {
  try {
    const { limit = 10, minProfit = 0.01 } = req.query;

    const opportunities = await aiService.getCurrentOpportunities({
      limit: parseInt(limit as string),
      minProfit: parseFloat(minProfit as string)
    });

    res.json({
      success: true,
      data: opportunities,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get opportunities', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to get opportunities',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * @route GET /api/ai/performance
 * @desc Get AI performance metrics
 * @access Private
 */
router.get('/performance', async (req: Request, res: Response) => {
  try {
    const { timeframe = '24h' } = req.query;

    const performance = await aiService.getPerformanceMetrics(timeframe as string);

    res.json({
      success: true,
      data: performance,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get performance metrics', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to get performance metrics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;


