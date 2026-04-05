'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DexPairData } from '@/lib/dexscreener';
import { API_BASE } from '@/lib/apiConfig';

interface AiSummaryProps {
  pair: DexPairData | null;
  loaded: boolean;
}

export function AiSummary({ pair, loaded }: AiSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchSummary = useCallback(async (pairData: DexPairData) => {
    setLoading(true);
    setError(false);
    setSummary(null);

    try {
      const prompt = `Given this DexScreener Solana pair data:
Token: ${pairData.baseToken.symbol}/${pairData.quoteToken.symbol}
Price: $${pairData.priceUsd}
Volume 5m: $${pairData.volume.m5.toFixed(0)}, 1h: $${pairData.volume.h1.toFixed(0)}, 24h: $${pairData.volume.h24.toFixed(0)}
Liquidity: $${pairData.liquidity.usd.toFixed(0)}
Price change 5m: ${pairData.priceChange.m5.toFixed(2)}%, 1h: ${pairData.priceChange.h1.toFixed(2)}%, 24h: ${pairData.priceChange.h24.toFixed(2)}%
Buys/Sells (1h): ${pairData.txns.h1.buys}/${pairData.txns.h1.sells}
DEX: ${pairData.dexId}

Summarize in exactly 4 lines:
Line 1: Trend: [Bullish/Bearish/Neutral]
Line 2: Volatility: [High/Medium/Low]
Line 3: Risk Level: [High/Medium/Low]
Line 4: Recommendation: [one sentence for arbitrage engine]
Be concise. No markdown.`;

      const base = API_BASE.endsWith('/api') ? API_BASE : API_BASE.replace(/\/$/, '');
      const res = await fetch(`${base}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxTokens: 150 }),
      });

      if (!res.ok) {
        setError(true);
        return;
      }

      const json = await res.json();
      const text = json?.response ?? json?.result ?? json?.text ?? '';
      if (text) {
        setSummary(String(text).trim());
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pair && loaded) {
      fetchSummary(pair);
    }
  }, [pair?.pairAddress, loaded, fetchSummary]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-white font-semibold">AI Market Summary</h2>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-600/30 text-purple-300">AI</span>
      </div>

      {!loaded && (
        <p className="text-sm text-dark-400">Load a pair to generate an AI summary</p>
      )}

      {loaded && loading && (
        <div className="space-y-2">
          <div className="h-4 w-48 bg-dark-700 rounded animate-pulse" />
          <div className="h-4 w-64 bg-dark-700 rounded animate-pulse" />
          <div className="h-4 w-40 bg-dark-700 rounded animate-pulse" />
          <p className="text-xs text-dark-500 mt-2">Generating summary...</p>
        </div>
      )}

      {loaded && !loading && error && (
        <p className="text-sm text-dark-400">AI summary unavailable</p>
      )}

      {loaded && !loading && summary && (
        <pre className="text-sm text-dark-200 whitespace-pre-wrap font-sans leading-relaxed">{summary}</pre>
      )}
    </div>
  );
}
