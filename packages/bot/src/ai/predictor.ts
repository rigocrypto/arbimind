/**
 * ArbiMind Opportunity Predictor
 * Uses TensorFlow.js when model exists, falls back to rule-based scoring.
 * See AI_SETUP.md for training.
 */

import path from 'path';
import fs from 'fs';

export interface PredictorResult {
  confidence: number;
  profitEst: number;
  execute: boolean;
  source: 'tfjs' | 'rule-based';
}

const MODEL_PATH = path.join(process.cwd(), 'models', 'predictor', 'model.json');

/**
 * Predict opportunity confidence from features.
 * Features: [delta (price %), liquidity (wei), volatility, sentiment (-1 to 1)]
 */
export async function predictOpportunity(features: number[]): Promise<PredictorResult> {
  const [delta = 0.006, liq = 1e6, vol = 0.02, sentiment = 0] = features;
  const normalized = [
    Math.min(delta * 100, 1),
    Math.min(liq / 1e9, 1),
    Math.min(vol * 10, 1),
    (sentiment + 1) / 2,
  ];

  // Try load TF.js model (dynamic import to avoid loading when not used)
  if (fs.existsSync(MODEL_PATH)) {
    try {
      const tf = await import('@tensorflow/tfjs-node');
      const model = await tf.loadLayersModel(`file://${MODEL_PATH}`);
      const input = tf.tensor2d([normalized]);
      const pred = model.predict(input);
      const tensor = Array.isArray(pred) ? pred[0] : pred;
      const confidence = Math.min(1, Math.max(0, (tensor as { dataSync: () => Float32Array }).dataSync()[0] as number));
      tf.dispose([input, tensor]);
      return {
        confidence,
        profitEst: confidence * delta * 100,
        execute: confidence > 0.8,
        source: 'tfjs',
      };
    } catch (e) {
      console.warn('TF.js model load failed, using rule-based:', (e as Error).message);
    }
  }

  // Rule-based fallback
  let score = 0;
  score += Math.min(delta * 100, 30);
  score += Math.min(liq / 5e6, 20);
  score += Math.min(vol * 50, 15);
  score += ((sentiment + 1) / 2) * 10;
  const confidence = Math.min(1, Math.max(0, score / 75));
  return {
    confidence,
    profitEst: confidence * delta * 100,
    execute: confidence > 0.8,
    source: 'rule-based',
  };
}
