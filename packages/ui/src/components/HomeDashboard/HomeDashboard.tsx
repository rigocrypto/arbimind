"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { MetricCard } from '@/components/MetricCard';
import { SystemStatus } from '@/components/SystemStatus';
import { PNLChart } from '@/components/Charts/PNLChart';
import { OpportunityFeed } from '@/components/OpportunityFeed';
import { StrategyCard } from '@/components/StrategyCard';
import { useMetrics, useStrategies, useOpportunities } from '@/hooks/useArbiApi';
import { formatETH, formatUSD, formatPercent } from '@/utils/format';
import { DollarSign, TrendingUp, Activity, Zap } from 'lucide-react';

const fadeIn = { hidden: { opacity: 0, y: 8 }, enter: { opacity: 1, y: 0 } };

export function HomeDashboard() {
  const { metrics, loading: metricsLoading } = useMetrics();
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { opportunities, loading: opportunitiesLoading } = useOpportunities();

  const safeMetrics = metrics || {
    profitEth: 0,
    profitUsd: 0,
    successRate: 0,
    totalTrades: 0,
    gasUsed: 0,
    latencyMs: 0,
    pnl24h: [],
    timestamp: [],
  };

  return (
    <div className="space-y-6 w-full">
      {/* HERO */}
      <motion.section className="glass-card p-6" initial="hidden" animate="enter" variants={fadeIn}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">ArbiMind Dashboard</h1>
            <p className="text-dark-300 mt-1 max-w-xl">Real-time monitoring and control for on-chain arbitrage strategies — metrics, charts, and live opportunities at a glance.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className="btn-primary">Start Engine</button>
              <button type="button" className="btn-ghost">Connect Wallet</button>
              <button type="button" className="btn-outline">Run Dry-Run</button>
            </div>
          </div>

          <div className="flex gap-4 items-center">
            <div className="text-right">
              <div className="text-sm text-dark-400">Total Profit (24h)</div>
              <div className="text-2xl font-bold">{formatETH(safeMetrics.profitEth)}</div>
              <div className="text-sm text-dark-400">{formatUSD(safeMetrics.profitUsd)}</div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Metrics Grid */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" initial="hidden" animate="enter" variants={fadeIn}>
        <MetricCard title="Total Profit" value={formatETH(safeMetrics.profitEth)} subtitle={formatUSD(safeMetrics.profitUsd)} gradient="green" sparklineData={safeMetrics.pnl24h} />
        <MetricCard title="Success Rate" value={formatPercent(safeMetrics.successRate)} subtitle={`${safeMetrics.totalTrades} trades`} gradient="cyan" />
        <MetricCard title="Total Trades" value={safeMetrics.totalTrades.toLocaleString()} subtitle="All time" gradient="purple" />
        <MetricCard title="Gas Used" value={formatETH(safeMetrics.gasUsed)} subtitle={`${safeMetrics.latencyMs}ms avg`} gradient="orange" />
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div className="lg:col-span-2 glass-card p-6" initial="hidden" animate="enter" variants={fadeIn}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold">24h Profit & Loss</h3>
            <div className="text-sm text-dark-400">Realtime · last 24h</div>
          </div>
          <div className="h-[320px]">
            <PNLChart data={safeMetrics.pnl24h} timestamps={safeMetrics.timestamp} height={320} />
          </div>
        </motion.div>

        <motion.aside className="glass-card p-6 space-y-4" initial="hidden" animate="enter" variants={fadeIn}>
          <SystemStatus />
          <div>
            <h4 className="text-sm font-semibold text-dark-300 mb-2">Quick Actions</h4>
            <div className="flex flex-col gap-2">
              <button type="button" className="btn cursor-pointer">Run Single Trade</button>
              <button type="button" className="btn cursor-pointer">Pause Engine</button>
              <button type="button" className="btn cursor-pointer">Reload Prices</button>
            </div>
          </div>
        </motion.aside>
      </div>

      {/* Strategies & Opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-2xl font-bold">AI Strategies</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {strategiesLoading ? (
              <div className="col-span-2 text-center text-dark-400 py-12">Loading strategies...</div>
            ) : (
              strategies.slice(0, 4).map((s) => (
                <StrategyCard key={s.id} strategy={s} onRun={() => {}} onToggleAuto={() => {}} />
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold">Live Opportunities</h2>
          <div className="glass-card p-4 max-h-[420px] overflow-auto">
            <OpportunityFeed opportunities={opportunities} onExecute={() => {}} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomeDashboard;
