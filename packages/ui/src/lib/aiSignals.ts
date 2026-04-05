/**
 * Heuristic-based AI signal computation for DexScreener pair data.
 * Pure functions — no API calls, no side effects.
 */

import type { DexPairData } from './dexscreener';

export type AlertLevel = 'green' | 'yellow' | 'red';

export interface AlertSignal {
  level: AlertLevel;
  message: string;
  source: 'heuristic';
}

/**
 * Compute alert signals from live pair data using threshold heuristics.
 * Each signal is tagged source:'heuristic' so the UI can distinguish from
 * ML-model signals added later.
 */
export function computeSignals(pair: DexPairData, prev?: DexPairData | null): AlertSignal[] {
  const signals: AlertSignal[] = [];

  // Volume spike: 5m volume > 2× of (h1 volume / 12 slots of 5m each)
  const avg5mFromH1 = pair.volume.h1 / 12;
  if (avg5mFromH1 > 0 && pair.volume.m5 > avg5mFromH1 * 2) {
    const pct = Math.round(((pair.volume.m5 - avg5mFromH1) / avg5mFromH1) * 100);
    signals.push({ level: 'yellow', message: `Volume spike detected (+${pct}% vs 1h avg)`, source: 'heuristic' });
  } else {
    signals.push({ level: 'green', message: 'Volume normal', source: 'heuristic' });
  }

  // Liquidity drop: compare to previous fetch if available
  if (prev && prev.liquidity.usd > 0) {
    const drop = (prev.liquidity.usd - pair.liquidity.usd) / prev.liquidity.usd;
    if (drop > 0.1) {
      signals.push({ level: 'red', message: `Liquidity drop −${(drop * 100).toFixed(1)}%`, source: 'heuristic' });
    } else {
      signals.push({ level: 'green', message: 'Liquidity stable', source: 'heuristic' });
    }
  } else {
    // No previous data to compare
    if (pair.liquidity.usd < 10_000) {
      signals.push({ level: 'red', message: 'Shallow liquidity (<$10k)', source: 'heuristic' });
    } else if (pair.liquidity.usd < 50_000) {
      signals.push({ level: 'yellow', message: 'Low liquidity (<$50k)', source: 'heuristic' });
    } else {
      signals.push({ level: 'green', message: 'Liquidity healthy', source: 'heuristic' });
    }
  }

  // Price move: |5m change| > 2%
  if (Math.abs(pair.priceChange.m5) > 5) {
    signals.push({ level: 'red', message: `Sharp price move ${pair.priceChange.m5 > 0 ? '+' : ''}${pair.priceChange.m5.toFixed(1)}% (5m)`, source: 'heuristic' });
  } else if (Math.abs(pair.priceChange.m5) > 2) {
    signals.push({ level: 'yellow', message: `Price volatility ${pair.priceChange.m5 > 0 ? '+' : ''}${pair.priceChange.m5.toFixed(1)}% (5m)`, source: 'heuristic' });
  } else {
    signals.push({ level: 'green', message: 'Price stable', source: 'heuristic' });
  }

  // Buy/sell imbalance (h1)
  const totalTxns = pair.txns.h1.buys + pair.txns.h1.sells;
  if (totalTxns > 0) {
    const buyRatio = pair.txns.h1.buys / totalTxns;
    if (buyRatio < 0.35) {
      signals.push({ level: 'red', message: `Sell pressure (buy ratio ${(buyRatio * 100).toFixed(0)}%)`, source: 'heuristic' });
    } else if (buyRatio > 0.75) {
      signals.push({ level: 'yellow', message: `Heavy buying (buy ratio ${(buyRatio * 100).toFixed(0)}%)`, source: 'heuristic' });
    } else {
      signals.push({ level: 'green', message: `Balanced flow (${(buyRatio * 100).toFixed(0)}% buys)`, source: 'heuristic' });
    }
  }

  // Thin market: low volume + spread proxy (high h1 change relative to h24 change hints thin order book)
  if (pair.volume.h1 < 5000 && Math.abs(pair.priceChange.h1) > 3) {
    signals.push({ level: 'yellow', message: 'Thin market warning (low vol + high spread)', source: 'heuristic' });
  }

  return signals;
}

/**
 * Compute a 0-100 opportunity score from pair data.
 *
 * Weights:
 *   volume health  — 25%  (log-scaled h1 volume vs $50k baseline)
 *   liquidity      — 25%  (log-scaled vs $100k baseline)
 *   buy ratio      — 15%  (distance from 50%, closer = more balanced = higher)
 *   volatility     — 20%  (moderate 1-5% h1 change scores highest)
 *   spread proxy   — 15%  (low 5m fluctuation + decent volume = tighter spread)
 */
export function opportunityScore(pair: DexPairData): number {
  // Volume: log scale, baseline $50k h1 volume = 50 points
  const volScore = Math.min(100, (Math.log10(Math.max(1, pair.volume.h1)) / Math.log10(500_000)) * 100);

  // Liquidity: log scale, baseline $100k = 50 points
  const liqScore = Math.min(100, (Math.log10(Math.max(1, pair.liquidity.usd)) / Math.log10(1_000_000)) * 100);

  // Buy ratio: 50% = perfect (100), deviations penalized quadratically
  const totalTxns = pair.txns.h1.buys + pair.txns.h1.sells;
  const buyRatio = totalTxns > 0 ? pair.txns.h1.buys / totalTxns : 0.5;
  const ratioDeviation = Math.abs(buyRatio - 0.5) * 2; // 0 to 1
  const ratioScore = (1 - ratioDeviation * ratioDeviation) * 100;

  // Volatility: sweet spot 1-5% h1 change, penalty for extremes
  const absH1 = Math.abs(pair.priceChange.h1);
  let volat: number;
  if (absH1 < 0.5) volat = 30; // too flat, limited opportunity
  else if (absH1 <= 5) volat = 80 + (absH1 / 5) * 20; // sweet spot
  else if (absH1 <= 15) volat = 100 - ((absH1 - 5) / 10) * 50; // declining
  else volat = 20; // extreme volatility

  // Spread proxy: low 5m change + OK volume → tight spread
  const spreadScore = pair.volume.m5 > 1000 && Math.abs(pair.priceChange.m5) < 1 ? 90 : Math.abs(pair.priceChange.m5) < 2 ? 60 : 30;

  const raw = volScore * 0.25 + liqScore * 0.25 + ratioScore * 0.15 + volat * 0.20 + spreadScore * 0.15;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

/**
 * Derive recommendation label from opportunity score.
 */
export function recommendation(score: number): { type: 'Arbitrage' | 'Monitor' | 'Avoid'; confidence: 'High' | 'Medium' | 'Low' } {
  if (score >= 70) return { type: 'Arbitrage', confidence: 'High' };
  if (score >= 40) return { type: 'Monitor', confidence: 'Medium' };
  return { type: 'Avoid', confidence: 'Low' };
}
