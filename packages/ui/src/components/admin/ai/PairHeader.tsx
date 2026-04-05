'use client';

import type { DexPairData } from '@/lib/dexscreener';

interface PairHeaderProps {
  pair: DexPairData | null;
  loaded: boolean;
}

export function PairHeader({ pair, loaded }: PairHeaderProps) {
  if (!loaded || !pair) {
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600/30 text-yellow-300">DEMO</span>
        </div>
        <div className="text-lg font-bold text-dark-500">No pair loaded</div>
        <div className="text-xs text-dark-500">Enter a Solana pair address above to start monitoring</div>
      </div>
    );
  }

  const change24h = pair.priceChange.h24;

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600/30 text-green-300">LIVE</span>
        <span className="text-xs text-dark-400">{pair.dexId}</span>
      </div>
      <div className="flex items-baseline gap-3 mb-1">
        <span className="text-lg font-bold text-white">
          {pair.baseToken.symbol}/{pair.quoteToken.symbol}
        </span>
        <span className="text-2xl font-bold text-white">
          ${pair.priceUsd < 0.01 ? pair.priceUsd.toPrecision(4) : pair.priceUsd.toFixed(4)}
        </span>
        <span className={`text-sm font-semibold ${change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {change24h >= 0 ? '+' : ''}
          {change24h.toFixed(2)}% (24h)
        </span>
      </div>
      <div className="text-[10px] text-dark-500">
        Last updated: {new Date(pair.fetchedAt).toLocaleTimeString()} · {pair.baseToken.name}
      </div>
    </div>
  );
}
