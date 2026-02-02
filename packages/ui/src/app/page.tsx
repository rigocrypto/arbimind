'use client';

import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { MetricCard } from '@/components/MetricCard';
import { StrategyCard } from '@/components/StrategyCard';
import { OpportunityFeed } from '@/components/OpportunityFeed';
import { SystemStatus } from '@/components/SystemStatus';
import { PNLChart } from '@/components/Charts/PNLChart';
import { useMetrics, useStrategies, useOpportunities } from '@/hooks/useArbiApi';
import { useEngineContext } from '@/contexts/EngineContext';
import { formatETH, formatUSD, formatPercent } from '@/utils/format';
import { DollarSign, TrendingUp, Activity, Zap, Gauge } from 'lucide-react';

export default function HomePage() {
  const { metrics, loading: metricsLoading } = useMetrics();
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { opportunities } = useOpportunities();
  const { start, stop, activeStrategy, checkBalance } = useEngineContext();

  const handleRunStrategy = (id: string) => {
    if (!checkBalance()) return;
    start(id);
  };
  const handleToggleAuto = (id: string, enabled: boolean) => {
    if (enabled) {
      if (!checkBalance()) return;
      start(id);
    } else stop();
  };

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
    <DashboardLayout currentPath="/">
      <div className="space-y-4 sm:space-y-6">
        {/* Hero Section */}
        <div className="glass-card p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 sm:gap-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                ArbiMind Dashboard
              </h1>
              <p className="text-dark-300 text-sm sm:text-base lg:text-lg max-w-2xl">
                Real-time monitoring and control for on-chain arbitrage strategies — metrics, charts, and live opportunities at a glance.
              </p>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="text-right">
                <div className="text-xs sm:text-sm text-dark-400 mb-1">Total Profit (24h)</div>
                <div className="text-2xl sm:text-3xl font-bold text-white">{formatETH(safeMetrics.profitEth)}</div>
                <div className="text-xs sm:text-sm text-dark-400">{formatUSD(safeMetrics.profitUsd)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <MetricCard
            title="Total Profit"
            value={formatETH(safeMetrics.profitEth)}
            subtitle={formatUSD(safeMetrics.profitUsd)}
            icon={DollarSign}
            gradient="green"
            sparklineData={safeMetrics.pnl24h}
          />
          <MetricCard
            title="Success Rate"
            value={formatPercent(safeMetrics.successRate)}
            subtitle={`${safeMetrics.totalTrades} trades`}
            icon={TrendingUp}
            gradient="cyan"
          />
          <MetricCard
            title="Total Trades"
            value={safeMetrics.totalTrades.toLocaleString()}
            subtitle="All time"
            icon={Activity}
            gradient="purple"
          />
          <MetricCard
            title="Gas Used"
            value={formatETH(safeMetrics.gasUsed)}
            subtitle={`${safeMetrics.latencyMs}ms avg latency`}
            icon={Gauge}
            gradient="orange"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* PNL Chart */}
          <div className="lg:col-span-2 glass-card p-4 sm:p-6 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 flex-shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-white">24h Profit & Loss</h3>
              <div className="text-xs sm:text-sm text-dark-400">Realtime · last 24h</div>
            </div>
            <div className="min-h-[200px] flex-1">
              {metricsLoading ? (
                <div className="h-full min-h-[200px] flex items-center justify-center text-dark-400">
                  <div className="animate-pulse">Loading chart...</div>
                </div>
              ) : (
                <PNLChart 
                  data={safeMetrics.pnl24h} 
                  timestamps={safeMetrics.timestamp} 
                />
              )}
            </div>
          </div>

          {/* System Status & Quick Actions */}
          <div className="space-y-4 sm:space-y-6">
            <SystemStatus />
            
            <div className="glass-card p-4 sm:p-6">
              <h4 className="text-sm font-semibold text-dark-300 mb-3 sm:mb-4">Quick Actions</h4>
              <div className="flex flex-col gap-2">
                <button 
                  type="button"
                  className="w-full px-4 py-2.5 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-white transition-all duration-200 font-medium text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  Run Single Trade
                </button>
                <button 
                  type="button"
                  className="w-full px-4 py-2.5 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-white transition-all duration-200 font-medium text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  Pause Engine
                </button>
                <button 
                  type="button"
                  className="w-full px-4 py-2.5 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-white transition-all duration-200 font-medium text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  Reload Prices
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Strategies & Opportunities */}
        <div className="space-y-4 sm:space-y-6">
          {/* AI Strategies */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-white">AI Strategies</h2>
              <span className="text-xs sm:text-sm text-dark-400">{strategies.length} active</span>
            </div>
            {strategiesLoading ? (
              <div className="glass-card p-8 sm:p-12 text-center text-dark-400">
                Loading strategies...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {strategies.slice(0, 4).map((strategy) => (
                  <StrategyCard
                    key={strategy.id}
                    strategy={strategy}
                    onRun={(id) => console.log('Run strategy:', id)}
                    onToggleAuto={(id, enabled) => console.log('Toggle auto:', id, enabled)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Live Opportunities */}
          <div className="glass-card p-4 sm:p-6 space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Live Opportunities</h2>
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            </div>
            <div className="max-h-[400px] sm:max-h-[500px] overflow-hidden">
              <OpportunityFeed opportunities={opportunities} />
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
