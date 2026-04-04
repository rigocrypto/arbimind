'use client';

import { Activity, Radio, SlidersHorizontal } from 'lucide-react';

import { HelpTooltip } from '@/components/HelpTooltip';
import { useFeedStore } from '@/stores/feedStore';

const modeOptions = [
  { label: 'Trader', value: 'TRADER' as const },
  { label: 'Operator', value: 'OPERATOR' as const },
];

const chainOptions = [
  { label: 'Both', value: 'BOTH' as const },
  { label: 'EVM', value: 'EVM' as const },
  { label: 'Solana', value: 'SOL' as const },
];

const sourceOptions = [
  { label: 'Demo', value: 'DEMO' as const },
  { label: 'Live', value: 'LIVE' as const },
];

export default function FeedControlRail() {
  const mode = useFeedStore((state) => state.mode);
  const chain = useFeedStore((state) => state.chain);
  const source = useFeedStore((state) => state.source);
  const filters = useFeedStore((state) => state.filters);
  const streamStatus = useFeedStore((state) => state.streamStatus);
  const lastTickAgoMs = useFeedStore((state) => state.lastTickAgoMs);
  const setMode = useFeedStore((state) => state.setMode);
  const setChain = useFeedStore((state) => state.setChain);
  const setSource = useFeedStore((state) => state.setSource);
  const setFilters = useFeedStore((state) => state.setFilters);

  const streamTone =
    streamStatus === 'DEMO'
      ? 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200'
      : streamStatus === 'LIVE'
      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
      : streamStatus === 'POLLING'
        ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
        : 'border-red-400/30 bg-red-500/10 text-red-300';

  return (
    <section className="sticky top-[4.5rem] z-30 glass-card p-3 sm:p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 p-2 text-cyan-300">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">Live Opportunity Control</p>
                {source === 'DEMO' && (
                  <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/30">
                    Demo
                  </span>
                )}
                <HelpTooltip content="Switch between trader workflow and operator automation without leaving the feed." />
              </div>
              <p className="text-xs text-dark-400">Hybrid terminal for scanning, simulating, and strategy creation.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {modeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className={[
                  'rounded-lg border px-3 py-2 text-sm font-medium transition',
                  mode === option.value
                    ? 'border-cyan-400/60 bg-cyan-500/20 text-white'
                    : 'border-white/10 bg-white/5 text-dark-300 hover:border-cyan-400/30 hover:text-white',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {chainOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setChain(option.value)}
                className={[
                  'rounded-lg border px-3 py-2 text-sm font-medium transition',
                  chain === option.value
                    ? 'border-purple-400/60 bg-purple-500/20 text-white'
                    : 'border-white/10 bg-white/5 text-dark-300 hover:border-purple-400/30 hover:text-white',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {sourceOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSource(option.value)}
                className={[
                  'rounded-lg border px-3 py-2 text-sm font-medium transition',
                  source === option.value
                    ? 'border-pink-400/60 bg-pink-500/20 text-white'
                    : 'border-white/10 bg-white/5 text-dark-300 hover:border-pink-400/30 hover:text-white',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${streamTone}`}>
            <Radio className="h-3.5 w-3.5" />
            <span>{streamStatus}</span>
            <span className="text-dark-200/80">
              {streamStatus === 'DEMO' ? 'local seeded data' : `last tick ${lastTickAgoMs}ms ago`}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-dark-300">
              <SlidersHorizontal className="h-4 w-4 text-cyan-300" />
              <span>Min $</span>
              <input
                type="number"
                min="0"
                value={filters.minNetUsd}
                onChange={(event) => setFilters({ minNetUsd: Number(event.target.value) || 0 })}
                className="w-16 bg-transparent text-right text-white focus:outline-none"
              />
            </label>

            <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-dark-300">
              <span>Confidence</span>
              <input
                type="number"
                min="0"
                max="100"
                value={Math.round(filters.minConfidence * 100)}
                onChange={(event) => setFilters({ minConfidence: Math.min(1, Math.max(0, Number(event.target.value) / 100)) })}
                className="w-14 bg-transparent text-right text-white focus:outline-none"
              />
              <span className="text-dark-400">%</span>
            </label>

            <button
              type="button"
              onClick={() => setFilters({ onlyExecutable: !filters.onlyExecutable })}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                filters.onlyExecutable
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/10 bg-white/5 text-dark-300 hover:text-white'
              }`}
            >
              Only executable
            </button>
            <button
              type="button"
              onClick={() => setFilters({ hideStale: !filters.hideStale })}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                filters.hideStale
                  ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300'
                  : 'border-white/10 bg-white/5 text-dark-300 hover:text-white'
              }`}
            >
              Hide stale
            </button>
            <button
              type="button"
              onClick={() => setFilters({ hideHighRisk: !filters.hideHighRisk })}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                filters.hideHighRisk
                  ? 'border-red-400/50 bg-red-500/15 text-red-300'
                  : 'border-white/10 bg-white/5 text-dark-300 hover:text-white'
              }`}
            >
              Hide high risk
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
