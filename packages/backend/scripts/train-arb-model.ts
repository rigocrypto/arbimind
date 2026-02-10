import fs from 'fs';
import path from 'path';
import type { io as tfio } from '@tensorflow/tfjs';

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

interface TrainingRow {
  profitPct: number;
  volumeUsd: number;
  liquidity: number;
  slippage: number;
  gasPrice: number;
  expectedProfitPct: number;
  successProb: number;
}

const fallbackData: TrainingRow[] = [
  { profitPct: 1.2, volumeUsd: 10000, liquidity: 500000, slippage: 0.3, gasPrice: 20, expectedProfitPct: 0.8, successProb: 0.9 },
  { profitPct: 0.4, volumeUsd: 2000, liquidity: 200000, slippage: 0.6, gasPrice: 35, expectedProfitPct: 0.2, successProb: 0.4 },
  { profitPct: 2.0, volumeUsd: 25000, liquidity: 900000, slippage: 0.2, gasPrice: 15, expectedProfitPct: 1.4, successProb: 0.95 },
  { profitPct: 0.8, volumeUsd: 8000, liquidity: 300000, slippage: 0.4, gasPrice: 25, expectedProfitPct: 0.5, successProb: 0.65 }
];

function loadTrainingData(): TrainingRow[] {
  const dataFlagIndex = process.argv.findIndex((arg) => arg === '--data');
  const dataPath = dataFlagIndex >= 0 ? process.argv[dataFlagIndex + 1] : undefined;

  if (!dataPath) return fallbackData;

  const resolved = path.resolve(process.cwd(), dataPath);
  if (!fs.existsSync(resolved)) return fallbackData;

  const raw = fs.readFileSync(resolved, 'utf-8');
  const parsed = JSON.parse(raw) as Array<Partial<TrainingRow> & { outcomeProfitPct?: number; success?: number }>;

  const normalized: TrainingRow[] = parsed.map((row) => ({
    profitPct: Number(row.profitPct ?? 0),
    volumeUsd: Number(row.volumeUsd ?? 0),
    liquidity: Number(row.liquidity ?? 0),
    slippage: Number(row.slippage ?? 0),
    gasPrice: Number(row.gasPrice ?? 0),
    expectedProfitPct: Number(row.expectedProfitPct ?? row.outcomeProfitPct ?? 0),
    successProb: row.successProb != null ? Number(row.successProb) : Number(row.success ?? 0),
  }));

  return normalized.length ? normalized : fallbackData;
}

const trainingData: TrainingRow[] = loadTrainingData();

const xs = tf.tensor2d(trainingData.map((d) => [
  d.profitPct / 100,
  d.volumeUsd / 1_000_000,
  d.liquidity / 1_000_000,
  d.slippage / 100,
  d.gasPrice / 50
]));

const ys = tf.tensor2d(trainingData.map((d) => [
  d.expectedProfitPct / 100,
  d.successProb
]));

const model = tf.sequential({
  layers: [
    tf.layers.dense({ inputShape: [5], units: 64, activation: 'relu' }),
    tf.layers.dense({ units: 32, activation: 'relu' }),
    tf.layers.dense({ units: 2, activation: 'sigmoid' })
  ]
});

model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });

async function train() {
  await model.fit(xs, ys, { epochs: 100, batchSize: 16 });
  const outputDir = path.resolve(process.cwd(), 'models', 'arb-predictor');
  fs.mkdirSync(outputDir, { recursive: true });

  if (hasNodeBackend) {
    await model.save(`file://${outputDir}`);
  } else {
    await model.save(tf.io.withSaveHandler(async (modelArtifacts) => {
      const weightBuffer = toBuffer(modelArtifacts.weightData);
      const modelJson = {
        modelTopology: modelArtifacts.modelTopology,
        format: modelArtifacts.format,
        generatedBy: modelArtifacts.generatedBy,
        convertedBy: modelArtifacts.convertedBy,
        weightsManifest: [
          {
            paths: ['weights.bin'],
            weights: modelArtifacts.weightSpecs ?? []
          }
        ]
      };

      fs.writeFileSync(path.join(outputDir, 'model.json'), JSON.stringify(modelJson));
      if (weightBuffer) {
        fs.writeFileSync(path.join(outputDir, 'weights.bin'), weightBuffer);
      }

      return {
        modelArtifactsInfo: {
          dateSaved: new Date(),
          modelTopologyType: 'JSON',
          modelTopologyBytes: modelArtifacts.modelTopology ? JSON.stringify(modelArtifacts.modelTopology).length : 0,
          weightSpecsBytes: modelArtifacts.weightSpecs ? JSON.stringify(modelArtifacts.weightSpecs).length : 0,
          weightDataBytes: weightBuffer ? weightBuffer.byteLength : 0
        }
      };
    }));
  }

  console.log(`✅ Arb model trained and saved to ${outputDir}`);
}

train().catch((error) => {
  console.error('❌ Training failed', error);
  process.exit(1);
});

function toBuffer(data: tfio.WeightData | undefined): Buffer | null {
  if (!data) return null;

  const anyData = data as any;

  if (anyData instanceof ArrayBuffer) {
    return Buffer.from(anyData);
  }

  if (Array.isArray(anyData)) {
    const total = anyData.reduce((sum: number, buf: ArrayBuffer) => sum + buf.byteLength, 0);
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const buf of anyData as ArrayBuffer[]) {
      combined.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }
    return Buffer.from(combined.buffer);
  }

  if (ArrayBuffer.isView(anyData)) {
    return Buffer.from((anyData as ArrayBufferView).buffer);
  }

  return Buffer.from(anyData as ArrayBuffer);
}
