'use client';

import type { DexPairData } from '@/lib/dexscreener';

interface KpiRowProps {
  pair: DexPairData | null;
  loaded: boolean;
}

function Badge({ live }: { live: boolean }) {
  return live ? (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600/30 text-green-300">LIVE</span>
  ) : (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600/30 text-yellow-300">DEMO</span>
  );
}

function fmt(v: number, prefix = ''): string {
  if (v >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${prefix}${(v / 1_000).toFixed(1)}K`;
  return `${prefix}${v.toFixed(2)}`;
}

const DEMO_CARDS = [
  { label: 'Price', value: '—' },
  { label: 'Volume 5m', value: '—' },
  { label: 'Liquidity', value: '—' },
  { label: 'Buy Ratio', value: '—' },
  { label: 'Volatility', value: '—' },
  { label: 'Spread', value: '—' },
];

export function KpiRow({ pair, loaded }: KpiRowProps) {
  const cards = pair
    ? [
        { label: 'Price', value: `$${pair.priceUsd < 0.01 ? pair.priceUsd.toPrecision(4) : pair.priceUsd.toFixed(4)}` },
        { label: 'Volume 5m', value: fmt(pair.volume.m5, '$') },
        { label: 'Liquidity', value: fmt(pair.liquidity.usd, '$') },
        {
          label: 'Buy Ratio',
          value:
            pair.txns.h1.buys + pair.txns.h1.sells > 0
              ? `${((pair.txns.h1.buys / (pair.txns.h1.buys + pair.txns.h1.sells)) * 100).toFixed(0)}%`
              : '—',
        },
        {
          label: 'Volatility',
          value:
            Math.abs(pair.priceChange.h1) > 5
              ? 'High'
              : Math.abs(pair.priceChange.h1) > 2
                ? 'Medium'
                : 'Low',
        },
        {
          label: 'Spread',
          value: `${Math.abs(pair.priceChange.m5).toFixed(2)}%`,
        },
      ]
    : DEMO_CARDS;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="card p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-dark-400 uppercase tracking-wider">{card.label}</span>
            <Badge live={loaded && !!pair} />
          </div>
          {!loaded ? (
            <div className="h-6 w-20 bg-dark-700 rounded animate-pulse" />
          ) : (
            <div className="text-lg font-bold text-white truncate">{card.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}
