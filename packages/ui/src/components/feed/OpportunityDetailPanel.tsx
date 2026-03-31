'use client';

import { useState } from 'react';
import { BarChart3, Bot, Download, Play, ShieldAlert, SlidersHorizontal } from 'lucide-react';

import { useFeedWalletCta } from '@/hooks/useFeedWalletCta';
import { useSimulation } from '@/hooks/useSimulation';
import type { Opportunity } from '@/lib/feed/types';
import { formatUSD } from '@/utils/format';
import { useFeedStore } from '@/stores/feedStore';

type OpportunityDetailPanelProps = {
  opportunity: Opportunity | null;
};

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-dark-400">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}

export default function OpportunityDetailPanel({ opportunity }: OpportunityDetailPanelProps) {
  const mode = useFeedStore((state) => state.mode);
  const cta = useFeedWalletCta(opportunity, mode);
  const simulation = useSimulation();
  const [simAmount, setSimAmount] = useState<number>(
    opportunity?.size?.min ?? 100
  );

  const handleSimulate = () => {
    if (!opportunity) return;
    simulation.mutate({ opportunity, amount: simAmount });
  };

  if (!opportunity) {
    return (
      <section className="glass-card p-5">
        <p className="text-sm font-semibold text-white">Opportunity Detail</p>
        <p className="mt-2 text-sm text-dark-400">Select a route from the feed to inspect the profit waterfall, sizing curve, and execution path.</p>
      </section>
    );
  }

  return (
    <section className="glass-card sticky top-[9.75rem] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-dark-500">{mode === 'TRADER' ? 'Trader Detail' : 'Operator Detail'}</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{opportunity.routeLabel}</h2>
          <p className="mt-1 text-sm text-dark-400">{opportunity.venues.join(' -> ')}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-dark-300">
          {opportunity.chain}
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-300" />
            <p className="text-sm font-semibold text-white">Profit Waterfall</p>
          </div>
          <div className="mt-3 space-y-2">
            <DetailLine label="Gross profit" value={formatUSD(opportunity.profit.grossUsd)} />
            <DetailLine label="Fees" value={formatUSD(opportunity.profit.feesUsd)} />
            <DetailLine label="Gas / priority" value={formatUSD((opportunity.profit.gasUsd ?? 0) + (opportunity.profit.priorityFeeUsd ?? 0))} />
            <DetailLine label="Expected slippage" value={formatUSD(opportunity.profit.slippageUsd)} />
            <div className="my-2 border-t border-white/10" />
            <DetailLine label="Net opportunity" value={formatUSD(opportunity.profit.netUsd)} />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-purple-300" />
            <p className="text-sm font-semibold text-white">Sizing Preview</p>
          </div>
          <input
            type="range"
            min={opportunity.size.min}
            max={opportunity.size.max}
            value={simAmount}
            onChange={(e) => setSimAmount(Number(e.target.value))}
            className="mt-4 w-full accent-purple-400"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-dark-400">
            <span>{opportunity.size.min} {opportunity.size.unit}</span>
            <span>{simAmount} {opportunity.size.unit}</span>
            <span>{opportunity.size.max} {opportunity.size.unit}</span>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            <p className="text-sm font-semibold text-white">Risk & Execution</p>
          </div>
          <div className="mt-3 space-y-2">
            <DetailLine label="Confidence" value={`${Math.round(opportunity.scores.confidence * 100)}%`} />
            <DetailLine label="Execution probability" value={`${Math.round((opportunity.scores.execProbability ?? 0.5) * 100)}%`} />
            {opportunity.scores.mevRisk != null ? <DetailLine label="MEV risk" value={`${Math.round(opportunity.scores.mevRisk * 100)}%`} /> : null}
            {opportunity.scores.volatilityRisk != null ? (
              <DetailLine label="Volatility risk" value={`${Math.round(opportunity.scores.volatilityRisk * 100)}%`} />
            ) : null}
          </div>
        </div>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={handleSimulate}
            disabled={simulation.isPending}
            className={`w-full rounded-lg py-3 text-sm font-semibold transition-colors ${
              simulation.isPending
                ? 'bg-white/10 text-white/40 cursor-wait'
                : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer'
            }`}
          >
            {simulation.isPending
              ? '⏳ Simulating...'
              : simulation.data
                ? '🔄 Re-simulate'
                : '▶ Simulate route'}
          </button>

          {simulation.data && (
            <div className={`mt-2 rounded-lg p-4 border ${
              simulation.data.willRevert
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-emerald-500/10 border-emerald-500/30'
            }`}>
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-white/80">
                  Simulation Result
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  simulation.data.willRevert
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {simulation.data.willRevert ? '⚠ Would Revert' : '✅ Profitable'}
                </span>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Input</span>
                  <span className="text-white">{simulation.data.inputAmount} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Output</span>
                  <span className="text-white">{simulation.data.outputAmount} USDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Net profit</span>
                  <span className={simulation.data.netProfit >= 0
                    ? 'text-emerald-400 font-semibold'
                    : 'text-red-400 font-semibold'
                  }>
                    {simulation.data.netProfit >= 0 ? '+' : ''}
                    ${simulation.data.netProfit.toFixed(4)}
                    {' '}({simulation.data.netBps} bps)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Fees</span>
                  <span className="text-white/80">
                    ~${simulation.data.estimatedFees.toFixed(4)}
                  </span>
                </div>
              </div>

              {/* Per-leg breakdown */}
              <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                <span className="text-xs text-white/50 uppercase tracking-wide">
                  Leg Breakdown
                </span>
                {simulation.data.legs.map((leg, i) => (
                  <div key={i} className="flex justify-between text-xs text-white/70">
                    <span>
                      {leg.venue} · {leg.inToken} → {leg.outToken}
                    </span>
                    <span>
                      {leg.inAmount} → {leg.outAmount}
                      {leg.priceImpact !== '0' && (
                        <span className="text-yellow-400 ml-1">
                          ({leg.priceImpact}% impact)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {simulation.data.willRevert && simulation.data.revertReason && (
                <div className="mt-3 text-xs text-red-400">
                  ⚠ {simulation.data.revertReason}
                </div>
              )}

              <div className="mt-2 text-xs text-white/30">
                Quoted {new Date(simulation.data.quotedAt).toLocaleTimeString()}
              </div>
            </div>
          )}

          {simulation.error && (
            <div className="mt-2 rounded-lg p-3 bg-red-500/10 border border-red-500/30">
              <span className="text-sm text-red-400">
                ❌ {simulation.error.message}
              </span>
              <button
                onClick={handleSimulate}
                className="ml-2 text-xs text-red-300 underline hover:text-red-200"
              >
                Retry
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => cta.runPrimaryAction()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 px-4 py-3 text-sm font-medium text-cyan-200 transition hover:from-cyan-500/30 hover:to-purple-500/30"
          >
            <Play className="h-4 w-4" />
            {cta.label}
          </button>
          <p className="text-xs text-dark-400">{cta.hint}</p>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-dark-200 transition hover:text-white"
          >
            <Bot className="h-4 w-4" />
            {mode === 'TRADER' ? 'Create bot rule' : 'Create alert'}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-dark-200 transition hover:text-white"
          >
            <Download className="h-4 w-4" />
            Export snapshot
          </button>
        </div>
      </div>
    </section>
  );
}
