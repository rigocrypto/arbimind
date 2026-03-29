'use client';

import { BarChart3, Bot, Download, Play, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { useAccount } from 'wagmi';

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
  const { isConnected } = useAccount();
  const mode = useFeedStore((state) => state.mode);

  if (!opportunity) {
    return (
      <section className="glass-card p-5">
        <p className="text-sm font-semibold text-white">Opportunity Detail</p>
        <p className="mt-2 text-sm text-dark-400">Select a route from the feed to inspect the profit waterfall, sizing curve, and execution path.</p>
      </section>
    );
  }

  const sizeMid = Math.round((opportunity.size.min + opportunity.size.max) / 2);
  const needsWallet = !isConnected;

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
            value={sizeMid}
            readOnly
            className="mt-4 w-full accent-purple-400"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-dark-400">
            <span>{opportunity.size.min} {opportunity.size.unit}</span>
            <span>Suggested {sizeMid} {opportunity.size.unit}</span>
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
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 px-4 py-3 text-sm font-medium text-cyan-200 transition hover:from-cyan-500/30 hover:to-purple-500/30"
          >
            <Play className="h-4 w-4" />
            {needsWallet ? 'Connect to simulate' : mode === 'TRADER' ? 'Simulate route' : 'Save as strategy'}
          </button>
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
