'use client';

import { Search, ShieldCheck, Sparkles } from 'lucide-react';

import { useFeedStore } from '@/stores/feedStore';

const presets = [
  { label: 'Safe', value: 'SAFE' as const },
  { label: 'High Profit', value: 'HIGH_PROFIT' as const },
  { label: 'Solana Fast Lane', value: 'SOLANA_FAST' as const },
];

export default function FeedFiltersSidebar() {
  const filters = useFeedStore((state) => state.filters);
  const applyPreset = useFeedStore((state) => state.applyPreset);
  const setFilters = useFeedStore((state) => state.setFilters);

  return (
    <div className="space-y-4">
      <section className="glass-card p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-cyan-300" />
          <h2 className="text-sm font-semibold text-white">Presets</h2>
        </div>
        <div className="mt-3 grid gap-2">
          {presets.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => applyPreset(preset.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-dark-200 transition hover:border-cyan-400/30 hover:text-white"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section className="glass-card p-4">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-purple-300" />
          <h2 className="text-sm font-semibold text-white">Search</h2>
        </div>
        <label htmlFor="feed-search" className="sr-only">Search routes</label>
        <input
          id="feed-search"
          type="text"
          value={filters.search}
          onChange={(event) => setFilters({ search: event.target.value })}
          placeholder="Token, DEX, route"
          className="input-field mt-3 w-full"
        />
      </section>

      <section className="glass-card p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-pink-300" />
          <h2 className="text-sm font-semibold text-white">Risk & Quality</h2>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-dark-400">
              <span>Minimum net profit</span>
              <span>${filters.minNetUsd}</span>
            </div>
            <input
              type="range"
              min="0"
              max="25"
              step="1"
              value={filters.minNetUsd}
              onChange={(event) => setFilters({ minNetUsd: Number(event.target.value) })}
              className="w-full accent-cyan-400"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-dark-400">
              <span>Minimum confidence</span>
              <span>{Math.round(filters.minConfidence * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(filters.minConfidence * 100)}
              onChange={(event) => setFilters({ minConfidence: Number(event.target.value) / 100 })}
              className="w-full accent-purple-400"
            />
          </div>

          <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-dark-300">
            <label className="flex items-center justify-between gap-3">
              <span>Only executable now</span>
              <input
                type="checkbox"
                checked={filters.onlyExecutable}
                onChange={(event) => setFilters({ onlyExecutable: event.target.checked })}
                className="h-4 w-4 accent-emerald-400"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Hide stale over 10s</span>
              <input
                type="checkbox"
                checked={filters.hideStale}
                onChange={(event) => setFilters({ hideStale: event.target.checked })}
                className="h-4 w-4 accent-cyan-400"
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Hide high risk</span>
              <input
                type="checkbox"
                checked={filters.hideHighRisk}
                onChange={(event) => setFilters({ hideHighRisk: event.target.checked })}
                className="h-4 w-4 accent-red-400"
              />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
