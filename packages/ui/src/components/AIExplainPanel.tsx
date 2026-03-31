'use client';

import type { ReactNode } from 'react';
import { Brain, Droplets, Gauge, ShieldAlert, Waves } from 'lucide-react';
import type { Opportunity } from '@/hooks/useArbiApi';

export interface ExplainabilityMetrics {
  volatility: number;
  liquidity: number;
  risk: number;
  slippagePct: number;
  rationale: string;
}

interface AIExplainPanelProps {
  opportunity: Opportunity | null;
  metrics: ExplainabilityMetrics | null;
  open: boolean;
  onClose: () => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function widthClass(value: number) {
  const bucket = Math.round(clamp(value, 0, 100) / 5) * 5;
  const classes: Record<number, string> = {
    0: 'w-0',
    5: 'w-[5%]',
    10: 'w-[10%]',
    15: 'w-[15%]',
    20: 'w-[20%]',
    25: 'w-[25%]',
    30: 'w-[30%]',
    35: 'w-[35%]',
    40: 'w-[40%]',
    45: 'w-[45%]',
    50: 'w-[50%]',
    55: 'w-[55%]',
    60: 'w-[60%]',
    65: 'w-[65%]',
    70: 'w-[70%]',
    75: 'w-[75%]',
    80: 'w-[80%]',
    85: 'w-[85%]',
    90: 'w-[90%]',
    95: 'w-[95%]',
    100: 'w-full',
  };

  return classes[bucket] ?? 'w-0';
}

function scoreColor(score: number) {
  if (score >= 70) return 'text-green-300';
  if (score >= 40) return 'text-amber-300';
  return 'text-red-300';
}

function meterColor(score: number) {
  if (score >= 70) return 'from-green-400/80 to-green-300/50';
  if (score >= 40) return 'from-amber-400/80 to-amber-300/40';
  return 'from-red-400/80 to-red-300/40';
}

function MetricBar({ label, icon, value }: { label: string; icon: ReactNode; value: number }) {
  const normalized = clamp(value, 0, 100);

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-dark-300">
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className={[ 'font-mono', scoreColor(normalized) ].join(' ')}>{(normalized ?? 0).toFixed(0)}</span>
      </div>
      <div className="h-2 rounded-full bg-dark-800/80 overflow-hidden">
        <div
          className={[
            'h-full rounded-full bg-gradient-to-r transition-all duration-300',
            meterColor(normalized),
            widthClass(normalized),
          ].join(' ')}
        />
      </div>
    </div>
  );
}

export function AIExplainPanel({ opportunity, metrics, open, onClose }: AIExplainPanelProps) {
  if (!open || !opportunity || !metrics) {
    return null;
  }

  return (
    <section className="glass-card p-4 sm:p-5 border-cyan-500/25">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-white inline-flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-300" />
            AI Decision Explainability
          </h3>
          <p className="mt-1 text-xs text-dark-300">
            {opportunity.pair} • {opportunity.fromDex} → {opportunity.toDex}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-dark-200 hover:bg-white/5"
        >
          Close
        </button>
      </div>

      <p className="text-sm text-dark-200 leading-relaxed mb-4">{metrics.rationale}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricBar label="Volatility" icon={<Waves className="h-3.5 w-3.5 text-purple-300" />} value={metrics.volatility} />
        <MetricBar label="Liquidity Depth" icon={<Droplets className="h-3.5 w-3.5 text-cyan-300" />} value={metrics.liquidity} />
        <MetricBar label="Risk Score" icon={<ShieldAlert className="h-3.5 w-3.5 text-amber-300" />} value={metrics.risk} />

        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-dark-300">
            <span className="inline-flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-cyan-300" />
              Slippage Prediction
            </span>
            <span className="font-mono text-cyan-200">{(metrics.slippagePct ?? 0).toFixed(2)}%</span>
          </div>
          <div className="h-2 rounded-full bg-dark-800/80 overflow-hidden">
            <div
              className={[
                'h-full rounded-full bg-gradient-to-r from-cyan-400/80 to-purple-400/60 transition-all duration-300',
                widthClass(clamp((metrics.slippagePct / 2) * 100, 0, 100)),
              ].join(' ')}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
