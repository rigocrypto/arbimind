import Joi from 'joi';

export const predictionSchema = Joi.object({
  tokenA: Joi.string().required(),
  tokenB: Joi.string().required(),
  dex1: Joi.string().required(),
  dex2: Joi.string().required(),
  amountIn: Joi.string().required(),
  priceData: Joi.object().optional(),
  orderBookData: Joi.object().optional(),
  marketData: Joi.object().optional()
});

export const sentimentSchema = Joi.object({
  tokens: Joi.array().items(Joi.string()).required(),
  sources: Joi.array().items(Joi.string()).optional()
});

export const trainingDataSchema = Joi.object({
  trainingData: Joi.array().required(),
  modelType: Joi.string().valid('prediction', 'sentiment', 'risk', 'all').required()
});

export const arbPredictionSchema = Joi.object({
  profitPct: Joi.number().required(),
  volumeUsd: Joi.number().required(),
  liquidity: Joi.number().required(),
  slippage: Joi.number().required(),
  gasPrice: Joi.number().required()
});

