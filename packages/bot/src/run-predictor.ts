#!/usr/bin/env node
/**
 * Run: pnpm tsx src/run-predictor.ts
 */
import { predictOpportunity } from './ai/predictor';

async function main() {
  console.log('🧠 ArbiMind Predictor Test\n');
  const features = [0.006, 1e6, 0.02, 0.5];
  console.log('Features: { delta: 0.6%, liquidity: 1M, volatility: 2%, sentiment: 0.5 }');
  const result = await predictOpportunity(features);
  console.log('Result:', result);
  console.log(result.execute ? '\n✅ EXECUTE recommended' : '\n⏸️ Wait for better opp');
}

main().catch(console.error).finally(() => process.exit(0));
