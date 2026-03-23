'use client';

import type { ComponentType } from 'react';
import { Activity, ArrowLeftRight, Network, Triangle } from 'lucide-react';

export type StrategyMode = 'dex' | 'cex' | 'cross-chain' | 'triangular';

interface StrategyToggleBarProps {
  value: StrategyMode;
  onChange: (next: StrategyMode) => void;
}

const STRATEGY_OPTIONS: Array<{ value: StrategyMode; label: string; icon: ComponentType<{ className?: string }> }> = [
  { value: 'dex', label: 'DEX Arbitrage', icon: Activity },
  { value: 'cex', label: 'CEX Arbitrage', icon: ArrowLeftRight },
  { value: 'cross-chain', label: 'Cross-chain', icon: Network },
  { value: 'triangular', label: 'Triangular', icon: Triangle },
];

export function StrategyToggleBar({ value, onChange }: StrategyToggleBarProps) {
  return (
    <section className="glass-card p-3 sticky top-[4.5rem] z-30">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STRATEGY_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={[
                'inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'border-cyan-400/60 bg-cyan-500/25 text-white shadow-[0_0_20px_rgba(0,229,204,0.25)]'
                  : 'border-white/15 bg-black/20 text-dark-300 hover:border-cyan-400/40 hover:text-white',
              ].join(' ')}
              aria-label={`${option.label} mode`}
            >
              <Icon className="h-4 w-4" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
