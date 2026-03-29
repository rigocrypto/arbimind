'use client';

import { Activity, Wallet } from 'lucide-react';

import { useFeedStore } from '@/stores/feedStore';

export default function FeedEmptyState() {
  const applyPreset = useFeedStore((state) => state.applyPreset);
  const setSource = useFeedStore((state) => state.setSource);

  return (
    <section className="glass-card p-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-300">
        <Activity className="h-8 w-8" />
      </div>
      <h2 className="mt-4 text-2xl font-bold text-white">Demo opportunities available</h2>
      <p className="mx-auto mt-2 max-w-2xl text-dark-400">
        Connect your wallet to unlock live opportunity simulation, or use a preset below to load demo routes tuned for your preferred style.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => applyPreset('SAFE')} className="btn-outline">
          Safe
        </button>
        <button type="button" onClick={() => applyPreset('HIGH_PROFIT')} className="btn-ghost">
          High Profit
        </button>
        <button type="button" onClick={() => applyPreset('SOLANA_FAST')} className="btn-ghost">
          Solana Fast Lane
        </button>
      </div>

      <div className="mt-4 flex justify-center">
        <button type="button" onClick={() => setSource('DEMO')} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-dark-200 transition hover:text-white">
          <Wallet className="h-4 w-4" />
          Stay in Demo Mode
        </button>
      </div>
    </section>
  );
}
