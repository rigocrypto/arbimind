'use client';

import { AlertTriangle, Bell, ChevronRight, Play, Sparkles } from 'lucide-react';

import { HelpTooltip } from '@/components/HelpTooltip';
import { useFeedWalletCta } from '@/hooks/useFeedWalletCta';
import type { FeedMode, Opportunity } from '@/lib/feed/types';
import { formatUSD } from '@/utils/format';
import { useRelativeTime } from '@/hooks/useRelativeTime';

type OpportunityRowProps = {
  opportunity: Opportunity;
  isSelected: boolean;
  mode: FeedMode;
  onSelect: () => void;
};

function getStatusTone(status: Opportunity['status']) {
  switch (status) {
    case 'READY':
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
    case 'NEEDS_APPROVAL':
      return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300';
    case 'LOW_BALANCE':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
    case 'HIGH_RISK':
      return 'border-red-400/30 bg-red-500/10 text-red-300';
    default:
      return 'border-white/10 bg-white/5 text-dark-300';
  }
}

export default function OpportunityRow({ opportunity, isSelected, mode, onSelect }: OpportunityRowProps) {
  const age = useRelativeTime(opportunity.ts);
  const cta = useFeedWalletCta(opportunity, mode);
  const statusTone = getStatusTone(opportunity.status);
  const confidencePct = Math.round(opportunity.scores.confidence * 100);
  const confidenceTone = confidencePct >= 80
    ? 'border-l-emerald-400/80'
    : confidencePct >= 60
      ? 'border-l-amber-400/80'
      : 'border-l-slate-400/70';
  const confidenceWidthClass = confidencePct >= 95
    ? 'w-[95%]'
    : confidencePct >= 90
      ? 'w-[90%]'
      : confidencePct >= 85
        ? 'w-[85%]'
        : confidencePct >= 80
          ? 'w-[80%]'
          : confidencePct >= 75
            ? 'w-[75%]'
            : confidencePct >= 70
              ? 'w-[70%]'
              : confidencePct >= 65
                ? 'w-[65%]'
                : confidencePct >= 60
                  ? 'w-[60%]'
                  : confidencePct >= 55
                    ? 'w-[55%]'
                    : confidencePct >= 50
                      ? 'w-[50%]'
                      : confidencePct >= 45
                        ? 'w-[45%]'
                        : confidencePct >= 40
                          ? 'w-[40%]'
                          : confidencePct >= 35
                            ? 'w-[35%]'
                            : confidencePct >= 30
                              ? 'w-[30%]'
                              : 'w-[25%]';

  return (
    <div
      onClick={onSelect}
      className={[
        'w-full rounded-2xl border border-l-4 p-3 text-left transition-all duration-150 sm:p-4',
        confidenceTone,
        isSelected
          ? 'border-cyan-400/40 bg-cyan-500/10 shadow-[0_0_28px_rgba(34,211,238,0.12)]'
          : 'border-white/10 bg-white/5 hover:border-cyan-400/20 hover:bg-white/7',
      ].join(' ')}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${opportunity.chain === 'EVM' ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-300' : 'border-purple-400/30 bg-purple-500/10 text-purple-300'}`}>
              {opportunity.chain}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone}`}>
              {opportunity.status.replace('_', ' ')}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium text-dark-300">
              {age}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white sm:text-lg">{opportunity.routeLabel}</h3>
              <HelpTooltip content={(opportunity.reasons ?? ['Opportunity metadata not available']).join(' • ')} />
            </div>
            <p className="mt-1 text-xs text-dark-400 sm:text-sm">{opportunity.venues.join(' -> ')}</p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-dark-400">
              <span>Confidence</span>
              <span className="text-dark-200">{confidencePct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={[
                  'h-full rounded-full transition-all',
                  confidenceWidthClass,
                  confidencePct >= 80 ? 'bg-emerald-400' : confidencePct >= 60 ? 'bg-amber-400' : 'bg-slate-400',
                ].join(' ')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-dark-500">Net Profit</p>
              <p className={`mt-1 text-xl font-bold sm:text-2xl ${opportunity.profit.netUsd >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {formatUSD(opportunity.profit.netUsd)}
              </p>
              <p className="text-xs text-dark-400">{opportunity.profit.netBps} bps</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-dark-500">Required Size</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {opportunity.size.min.toLocaleString()} - {opportunity.size.max.toLocaleString()} {opportunity.size.unit}
              </p>
              <p className="text-xs text-dark-400">
                Fees {formatUSD(opportunity.profit.feesUsd)} / Slippage {formatUSD(opportunity.profit.slippageUsd)}
              </p>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <p className="text-xs uppercase tracking-[0.16em] text-dark-500">Confidence</p>
              <p className="mt-1 text-sm font-semibold text-white">{confidencePct}%</p>
              <p className="text-xs text-dark-400">
                Exec {Math.round((opportunity.scores.execProbability ?? 0.5) * 100)}%
                {opportunity.scores.mevRisk != null ? ` • MEV ${Math.round(opportunity.scores.mevRisk * 100)}%` : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2.5 sm:min-w-[220px] sm:gap-3">
          <div className="hidden rounded-xl border border-white/10 bg-black/20 p-3 sm:block">
            <div className="flex items-center justify-between text-xs text-dark-400">
              <span>Execution path</span>
              <span>{opportunity.venues.length} venues</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {opportunity.venues.map((venue) => (
                <span key={`${opportunity.id}-${venue}`} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-dark-200">
                  {venue}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                cta.runPrimaryAction(onSelect);
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 px-3 py-2 text-sm font-medium text-cyan-200 transition hover:from-cyan-500/30 hover:to-purple-500/30"
            >
              {mode === 'OPERATOR' ? <Sparkles className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {cta.label}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-dark-200 transition hover:text-white"
            >
              <Bell className="h-4 w-4" />
              Alert me
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-dark-400">
            <span className="inline-flex items-center gap-1">
              {opportunity.status === 'HIGH_RISK' ? <AlertTriangle className="h-3.5 w-3.5 text-red-300" /> : null}
              {cta.hint}
            </span>
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
