# 🧠 ArbiMind AI Setup

## TensorFlow.js Models

```bash
cd packages/bot
pnpm add @tensorflow/tfjs-node @tensorflow/tfjs-layers
```

### 1. Opportunity Predictor

`src/ai/predictor.ts`:

```typescript
import * as tf from '@tensorflow/tfjs-node';

export async function predictOpportunity(features: number[]) {
  // [delta, liq, vol, sentiment]
  const model = await tf.loadLayersModel('file://models/predictor/model.json');
  const input = tf.tensor2d([features]);
  const pred = model.predict(input) as tf.Tensor;
  const confidence = pred.dataSync()[0];
  return { confidence, profitEst: confidence * features[0] * 100 };
}
```

### 2. Train Model

`train.js`:

```javascript
const model = tf.sequential();
model.add(tf.layers.dense({ inputShape: [4], units: 32, activation: 'relu' }));
model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy' });

// Historical arb data CSV
model.fit(xs, ys).then(() => model.save('file://models/predictor'));
```

### 3. Sentiment Analysis

```bash
pnpm add twitter-api-v2
```

```typescript
async function getSentiment(token: string) {
  const client = new TwitterApi(BEARER_TOKEN);
  const tweets = await client.v2.search(`#${token} OR $${token}`);
  // Vader/NLTK mock
  return 0.8;  // Bullish score
}
```

### Usage

```typescript
const features = [0.006, 1e6, 0.02, sentiment];
const opp = await predictOpportunity(features);
if (opp.confidence > 0.8) execute();
```

**Models**: Historical data from Dune Analytics arb opps.

**Refresh**: Cron job retrain weekly.
