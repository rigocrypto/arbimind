let tf: typeof import('@tensorflow/tfjs');
let hasNodeBackend = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  tf = require('@tensorflow/tfjs-node') as typeof import('@tensorflow/tfjs');
  hasNodeBackend = true;
} catch {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  tf = require('@tensorflow/tfjs') as typeof import('@tensorflow/tfjs');
  hasNodeBackend = false;
}
import path from 'path';
import fs from 'fs';
import type { LayersModel, Tensor, io as tfio } from '@tensorflow/tfjs';
import { logger } from '../utils/logger';

export interface ArbInput {
  profitPct: number;
  volumeUsd: number;
  liquidity: number;
  slippage: number;
  gasPrice: number;
}

export interface ArbPrediction {
  expectedProfitPct: number;
  successProb: number;
}

export class ArbModel {
  private model: LayersModel | null = null;
  private loaded: boolean = false;

  public async loadModel(modelPath: string = process.env.ARB_MODEL_PATH || './models/arb-predictor'): Promise<void> {
    try {
      const resolved = path.resolve(process.cwd(), modelPath);
      if (hasNodeBackend) {
        const modelUrl = `file://${resolved}/model.json`;
        this.model = await tf.loadLayersModel(modelUrl);
      } else {
        const modelJsonPath = path.join(resolved, 'model.json');
        const weightsPath = path.join(resolved, 'weights.bin');
        const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf-8')) as {
          modelTopology: tfio.ModelJSON['modelTopology'];
          weightsManifest: Array<{ paths: string[]; weights: tfio.WeightsManifestEntry[] }>;
        };
        const weightData = fs.readFileSync(weightsPath).buffer;
        const weightSpecs = modelJson.weightsManifest?.[0]?.weights ?? [];
        this.model = await tf.loadLayersModel(tf.io.fromMemory({
          modelTopology: modelJson.modelTopology,
          weightSpecs,
          weightData
        }));
      }
      this.loaded = true;
      logger.info('Arb model loaded', { modelPath: resolved });
    } catch (error) {
      this.model = null;
      this.loaded = false;
      logger.warn('Arb model not loaded - falling back to heuristic', {
        error: error instanceof Error ? error.message : error
      });
    }
  }

  public isLoaded(): boolean {
    return this.loaded;
  }

  public predict(inputs: ArbInput): ArbPrediction {
    if (!this.model) {
      const expectedProfitPct = Math.max(0, inputs.profitPct * 0.8);
      const successProb = clamp(0.5 + inputs.profitPct / 200, 0, 1);
      return { expectedProfitPct, successProb };
    }

    const tensor = tf.tensor2d([[
      inputs.profitPct / 100,
      inputs.volumeUsd / 1_000_000,
      inputs.liquidity / 1_000_000,
      inputs.slippage / 100,
      inputs.gasPrice / 50
    ]]);

    const pred = this.model.predict(tensor) as Tensor;
    const data = pred.dataSync();
    const expectedProfitPct = clamp(data[0] ?? 0, 0, 10) * 100;
    const successProb = clamp(data[1] ?? 0, 0, 1);

    tensor.dispose();
    pred.dispose();

    return { expectedProfitPct, successProb };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
