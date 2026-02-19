'use client';

import { useEffect, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { MetricCard } from '@/components/MetricCard';
import { StrategyCard } from '@/components/StrategyCard';
import { SystemStatus } from '@/components/SystemStatus';
import { useMetrics, useStrategies, useOpportunities } from '@/hooks/useArbiApi';
import { useAccount } from 'wagmi';
import { useEngineContext } from '@/contexts/EngineContext';
import { formatETH, formatUSD, formatPercent } from '@/utils/format';
import { getPersistentCtaVariant, trackEvent } from '@/lib/analytics';
import { DollarSign, TrendingUp, Activity, Zap, Gauge } from 'lucide-react';
import toast from 'react-hot-toast';

const PNLChart = dynamic(
  () => import('@/components/Charts/PNLChart').then((m) => ({ default: m.PNLChart })),
  { ssr: false, loading: () => <div className="h-full flex items-center justify-center text-dark-400 animate-pulse">Loading chart...</div> }
);

const AnalystCharts = dynamic(
  () => import('@/components/Charts/AnalystCharts').then((m) => ({ default: m.AnalystCharts })),
  { ssr: false, loading: () => <div className="h-24 animate-pulse bg-dark-800/50 rounded" /> }
);

const OpportunityFeed = dynamic(
  () => import('@/components/OpportunityFeed').then((m) => ({ default: m.OpportunityFeed })),
  { ssr: false, loading: () => <div className="py-8 text-center text-dark-400 animate-pulse">Loading feed...</div> }
);

export default function HomePage() {
  const { isConnected } = useAccount();
  const ctaVariant = useMemo(() => getPersistentCtaVariant(), []);
  const landingTrackedRef = useRef(false);
  const { metrics, loading: metricsLoading } = useMetrics();
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { opportunities, loading: opportunitiesLoading } = useOpportunities();
  const { start, stop, singleScan, reloadPrices, activeStrategy, isRunning, checkBalance } = useEngineContext();

  useEffect(() => {
    if (landingTrackedRef.current) {
      return;
    }

    landingTrackedRef.current = true;
    trackEvent('landing_view', {
      connected: isConnected,
      ctaVariant,
    });
  }, [isConnected, ctaVariant]);

  const handleGuardedAction = (action: () => void | Promise<void>) => {
    if (!isConnected) {
      toast.error('Connect wallet first!');
      return;
    }
    if (!checkBalance()) return;
    void action();
  };

  const handleRunStrategy = (id: string) => {
    if (!checkBalance()) return;
    trackEvent('canary_start_clicked', {
      source: 'strategy_card_run_now',
      strategyId: id,
    });
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

  // Derived sparkline data for each metric card (compact, fits in card)
  const profitSparkline =
    safeMetrics.pnl24h?.length > 0
      ? safeMetrics.pnl24h
      : Array.from(
          { length: 12 },
          (_, i) => (safeMetrics.profitEth || 2.4) * (0.1 + 0.9 * (i + 1) / 12)
        );
  const successSparkline =
    safeMetrics.successRate > 0
      ? Array.from({ length: 12 }, (_, i) => safeMetrics.successRate * (0.6 + 0.4 * (i / 11)))
      : [70, 75, 78, 82, 85, 86, 87, 87.5, 87.5, 87.5, 87.5, 87.5];
  const tradesSparkline =
    safeMetrics.totalTrades > 0
      ? Array.from(
          { length: 12 },
          (_, i) =>
            Math.round(safeMetrics.totalTrades * (0.05 + 0.95 * Math.pow((i + 1) / 12, 0.7)))
        )
      : [50, 150, 300, 500, 700, 900, 1100, 1200, 1230, 1240, 1245, 1247];
  const gasSparkline =
    safeMetrics.gasUsed > 0
      ? Array.from({ length: 12 }, (_, i) => safeMetrics.gasUsed * (0.2 + 0.8 * (i + 1) / 12))
      : [0.005, 0.01, 0.012, 0.015, 0.018, 0.02, 0.021, 0.022, 0.023, 0.0232, 0.0233, 0.0234];

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
            sparklineData={profitSparkline}
          />
          <MetricCard
            title="Success Rate"
            value={formatPercent(safeMetrics.successRate)}
            subtitle={`${safeMetrics.totalTrades} trades`}
            icon={TrendingUp}
            gradient="cyan"
            sparklineData={successSparkline}
          />
          <MetricCard
            title="Total Trades"
            value={safeMetrics.totalTrades.toLocaleString()}
            subtitle="All time"
            icon={Activity}
            gradient="purple"
            sparklineData={tradesSparkline}
          />
          <MetricCard
            title="Gas Used"
            value={formatETH(safeMetrics.gasUsed)}
            subtitle={`${safeMetrics.latencyMs}ms avg latency`}
            icon={Gauge}
            gradient="orange"
            sparklineData={gasSparkline}
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
            <div className="h-[180px] sm:h-[200px]">
              {metricsLoading ? (
                <div className="h-full flex items-center justify-center text-dark-400">
                  <div className="animate-pulse">Loading chart...</div>
                </div>
              ) : (
                <PNLChart 
                  data={safeMetrics.pnl24h} 
                  timestamps={safeMetrics.timestamp} 
                />
              )}
            </div>
            <AnalystCharts
              strategies={strategies}
              timestamps={safeMetrics.timestamp}
              totalTrades={safeMetrics.totalTrades}
            />
          </div>

          {/* System Status & Quick Actions */}
          <div className="space-y-4 sm:space-y-6">
            <SystemStatus />
            
            <div className="glass-card p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h4 className="text-sm font-semibold text-dark-300">Quick Actions</h4>
                <span className="text-xs text-dark-400">{strategies.length} active</span>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleGuardedAction(async () => {
                      trackEvent('canary_start_clicked', {
                        source: 'quick_action_single_trade',
                      });
                      const ok = await singleScan();
                      if (ok) {
                        toast.success('Single scan started');
                      } else {
                        toast.error('Scan failed');
                      }
                    })
                  }
                  disabled={!isConnected}
                  title={!isConnected ? 'Connect wallet first' : undefined}
                  className="w-full px-4 py-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 transition-all duration-200 font-medium text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Run Single Trade
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isConnected) {
                      toast.error('Connect wallet first!');
                      return;
                    }
                    if (!isRunning) {
                      toast('Engine already stopped');
                      return;
                    }
                    void stop().then(() => toast.success('Engine paused'));
                  }}
                  disabled={!isRunning || !isConnected}
                  title={!isConnected ? 'Connect wallet first' : undefined}
                  className="w-full px-4 py-2.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 transition-all duration-200 font-medium text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Pause Engine
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!isConnected) {
                      toast.error('Connect wallet first!');
                      return;
                    }
                    const ok = await reloadPrices();
                    if (ok) {
                      toast.success('Prices refreshed');
                    } else {
                      toast.error('Reload failed');
                    }
                  }}
                  disabled={!isConnected}
                  title={!isConnected ? 'Connect wallet first' : undefined}
                  className="w-full px-4 py-2.5 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-white transition-all duration-200 font-medium text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div className="w-full flex justify-center">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 justify-items-center">
                  {strategies.slice(0, 4).map((strategy) => (
                    <StrategyCard
                      key={strategy.id}
                      strategy={strategy}
                      engineActiveStrategy={activeStrategy}
                      onRun={handleRunStrategy}
                      onToggleAuto={handleToggleAuto}
                    />
                  ))}
                </div>
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
              {opportunitiesLoading && opportunities.length === 0 ? (
                <div className="py-12 text-center text-dark-400 animate-pulse">Loading opportunities...</div>
              ) : (
                <OpportunityFeed opportunities={opportunities} />
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
