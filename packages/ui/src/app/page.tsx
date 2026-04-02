'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { MetricCard } from '@/components/MetricCard';
import { StrategyCard } from '@/components/StrategyCard';
import { SystemStatus } from '@/components/SystemStatus';
import { StrategyToggleBar, type StrategyMode } from '@/components/StrategyToggleBar';
import { AutoModePanel } from '@/components/AutoModePanel';
import { ExecutionTimeline, type ExecutionTimelineStep, type ExecutionTimelineStatus } from '@/components/ExecutionTimeline';
import { ProfitTicker } from '@/components/ProfitTicker';
import { AIExplainPanel, type ExplainabilityMetrics } from '@/components/AIExplainPanel';
import { AIConfidenceRadar } from '@/components/AIConfidenceRadar';
import { NotificationsPanel, type NotificationItem } from '@/components/NotificationsPanel';
import { useMetrics, useStrategies, useOpportunities, type Opportunity } from '@/hooks/useArbiApi';
import { useAccount } from 'wagmi';
import { useEngineContext } from '@/contexts/EngineContext';
import { formatETH, formatUSD, formatPercent } from '@/utils/format';
import { getPersistentCtaVariant, trackEvent } from '@/lib/analytics';
import { DollarSign, TrendingUp, Activity, Zap, Gauge, Bell } from 'lucide-react';
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

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function explainMetricsForOpportunity(opportunity: Opportunity | null): ExplainabilityMetrics | null {
  if (!opportunity) return null;

  const profitSignal = clamp(opportunity.profitPct * 120, 15, 95);
  const gasPenalty = clamp(opportunity.gasEst * 120000, 0, 40);
  const volatility = clamp(45 + opportunity.profitPct * 90, 5, 98);
  const liquidity = clamp(82 - gasPenalty, 20, 96);
  const risk = clamp(62 - opportunity.profitPct * 80 + gasPenalty / 1.8, 8, 92);
  const slippagePct = clamp(0.18 + opportunity.gasEst * 9, 0.05, 1.8);

  return {
    volatility,
    liquidity,
    risk,
    slippagePct,
    rationale: `AI prioritized ${opportunity.pair} because spread quality (${(profitSignal ?? 0).toFixed(0)} score) and route depth are favorable. ${opportunity.fromDex} -> ${opportunity.toDex} shows positive net edge after estimated gas and projected slippage.`
  };
}

function makeNotification(type: NotificationItem['type'], message: string): NotificationItem {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    timestamp: Date.now(),
    ttlMs: 8000,
  };
}

export default function HomePage() {
  const { isConnected } = useAccount();
  const ctaVariant = useMemo(() => getPersistentCtaVariant(), []);
  const landingTrackedRef = useRef(false);
  const { metrics, loading: metricsLoading } = useMetrics();
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { opportunities, loading: opportunitiesLoading } = useOpportunities();
  const { start, stop, singleScan, reloadPrices, activeStrategy, isRunning, checkBalance } = useEngineContext();
  const [strategyMode, setStrategyMode] = useState<StrategyMode>('dex');
  const [autoModeEnabled, setAutoModeEnabled] = useState(false);

  // Hydration-safe: read persisted value only on client after mount
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('arbimind:autoTrade');
      if (saved === '1') setAutoModeEnabled(true);
    } catch { /* private/SSR */ }
  }, []);

  // Sync local toggle with backend engine state (polled every 10s)
  const isRunningPrev = useRef(isRunning);
  useEffect(() => {
    if (isRunning !== isRunningPrev.current) {
      isRunningPrev.current = isRunning;
      setAutoModeEnabled(isRunning);
    }
  }, [isRunning]);

  // Persist toggle to localStorage
  const setAutoModeEnabledPersisted = useCallback((next: boolean) => {
    setAutoModeEnabled(next);
    try { window.localStorage.setItem('arbimind:autoTrade', next ? '1' : '0'); } catch { /* private mode */ }
  }, []);

  const [maxRiskPct, setMaxRiskPct] = useState(2);
  const [maxTradeSizeEth, setMaxTradeSizeEth] = useState(0.35);
  const [timelineStep, setTimelineStep] = useState<ExecutionTimelineStep>(0);
  const [timelineStatus, setTimelineStatus] = useState<ExecutionTimelineStatus>('idle');
  const [singleScanAnimating, setSingleScanAnimating] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const previousOpportunitiesCountRef = useRef(0);

  const selectedExplainMetrics = useMemo(
    () => explainMetricsForOpportunity(selectedOpportunity),
    [selectedOpportunity]
  );

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

  const strategyForMode = useMemo(() => {
    if (strategies.length === 0) return undefined;

    const candidateTerms: Record<StrategyMode, string[]> = {
      dex: ['arb', 'arbitrage', 'dex', 'uni', 'sushi'],
      cex: ['cex', 'exchange', 'binance', 'kraken', 'coinbase'],
      'cross-chain': ['cross', 'bridge', 'multi'],
      triangular: ['triangular', 'triangle'],
    };

    const terms = candidateTerms[strategyMode];

    const matched = strategies.find((strategy) => {
      const candidate = `${strategy.id} ${strategy.name}`.toLowerCase();
      return terms.some((term) => candidate.includes(term));
    });

    return matched?.id ?? activeStrategy ?? strategies[0]?.id;
  }, [activeStrategy, strategies, strategyMode]);

  useEffect(() => {
    if (singleScanAnimating) {
      return;
    }

    let frameId: number | undefined;

    if (autoModeEnabled || isRunning) {
      frameId = window.requestAnimationFrame(() => {
        setTimelineStatus('running');
        setTimelineStep(opportunities.length > 0 ? 1 : 0);
      });
      return;
    }

    frameId = window.requestAnimationFrame(() => {
      setTimelineStatus('idle');
      setTimelineStep(0);
    });

    return () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [autoModeEnabled, isRunning, opportunities.length, singleScanAnimating]);

  useEffect(() => {
    const previousCount = previousOpportunitiesCountRef.current;
    let frameId: number | undefined;

    if (opportunities.length > previousCount) {
      const latest = opportunities[0];
      if (latest) {
        frameId = window.requestAnimationFrame(() => {
          setNotifications((current) => [
            makeNotification(
              'opportunity_found',
              `${latest.pair} opportunity found (${(latest.profitPct ?? 0).toFixed(2)}% spread)`
            ),
            ...current,
          ].slice(0, 10));
        });
      }
    }

    previousOpportunitiesCountRef.current = opportunities.length;

    return () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [opportunities]);

  const handleAutoModeToggle = async (next: boolean) => {
    if (next) {
      if (!isConnected) {
        toast.error('Connect wallet first!');
        return;
      }
      if (!checkBalance()) return;

      await start(strategyForMode);
      setAutoModeEnabledPersisted(true);
      setTimelineStatus('running');
      setTimelineStep(0);
      toast.success('Auto mode enabled');
      setNotifications((current) => [
        makeNotification('trade_executed', 'Auto mode enabled. Engine can execute opportunities automatically.'),
        ...current,
      ].slice(0, 10));
      return;
    }

    await stop();
    setAutoModeEnabledPersisted(false);
    setTimelineStatus('idle');
    setTimelineStep(0);
    toast.success('Auto mode disabled');
  };

  const runSingleTradeScan = async () => {
    if (!checkBalance()) return;

    setSingleScanAnimating(true);
    setTimelineStatus('running');
    setTimelineStep(0);
    await delay(150);
    setTimelineStep(1);
    await delay(180);
    setTimelineStep(2);
    await delay(180);
    setTimelineStep(3);

    const ok = await singleScan();

    if (ok) {
      setTimelineStep(4);
      setTimelineStatus('complete');
      toast.success('Single scan started');
      window.setTimeout(() => {
        setTimelineStatus(autoModeEnabled || isRunning ? 'running' : 'idle');
        setTimelineStep(autoModeEnabled || isRunning ? 1 : 0);
      }, 900);
    } else {
      setTimelineStatus('error');
      toast.error('Scan failed');
      window.setTimeout(() => {
        setTimelineStatus(autoModeEnabled || isRunning ? 'running' : 'idle');
        setTimelineStep(autoModeEnabled || isRunning ? 1 : 0);
      }, 900);
    }

    window.setTimeout(() => {
      setSingleScanAnimating(false);
    }, 950);
  };

  const handleRunStrategy = (id: string) => {
    if (!checkBalance()) return;
    trackEvent('canary_start_clicked', {
      source: 'strategy_card_run_now',
      strategyId: id,
    });
    start(id);
  };

  const handleOpportunityExecuted = (id: string) => {
    const matched = opportunities.find((item) => item.id === id);
    const message = matched
      ? `${matched.pair} executed successfully with projected net gain ${formatETH(matched.netGain)}.`
      : `Opportunity ${id} executed successfully.`;

    setNotifications((current) => [makeNotification('trade_executed', message), ...current].slice(0, 10));
  };

  const handleDismissNotification = (id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
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

  const radarData = {
    confidence: clamp(safeMetrics.successRate, 0, 100),
    liquidity: clamp(72 + safeMetrics.totalTrades / 60, 20, 100),
    risk: clamp(55 - safeMetrics.successRate / 3 + safeMetrics.gasUsed * 700, 5, 95),
    speed: clamp(100 - safeMetrics.latencyMs / 3, 5, 100),
  };

  return (
    <DashboardLayout currentPath="/">
      <div className="space-y-4 sm:space-y-6">
        <div className="fixed right-4 bottom-20 md:right-5 md:bottom-6 z-40">
          <button
            type="button"
            onClick={() => setNotificationsOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-dark-900/80 px-3 py-2 text-xs text-cyan-200 shadow-lg shadow-cyan-900/40 hover:bg-dark-800"
            aria-label="Toggle notifications"
          >
            <Bell className="h-4 w-4" />
            <span>{notifications.length}</span>
          </button>
        </div>

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
                <div className="text-xs sm:text-sm text-dark-400">
                  <ProfitTicker value={safeMetrics.profitUsd} prefix="$" className="font-mono" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-3">
          <div className="space-y-3 sm:space-y-4 xl:col-span-2">
            <StrategyToggleBar value={strategyMode} onChange={setStrategyMode} />
            <ExecutionTimeline currentStep={timelineStep} status={timelineStatus} />
            <AIExplainPanel
              opportunity={selectedOpportunity}
              metrics={selectedExplainMetrics}
              open={selectedOpportunity !== null}
              onClose={() => setSelectedOpportunity(null)}
            />
          </div>
          <AutoModePanel
            isEnabled={autoModeEnabled}
            maxRiskPct={maxRiskPct}
            maxTradeSizeEth={maxTradeSizeEth}
            onRiskChange={setMaxRiskPct}
            onTradeSizeChange={setMaxTradeSizeEth}
            onToggle={handleAutoModeToggle}
            disabled={!isConnected}
          />
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
            <AIConfidenceRadar data={radarData} />
            
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
                      await runSingleTradeScan();
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
                <OpportunityFeed
                  opportunities={opportunities}
                  onExecute={handleOpportunityExecuted}
                  onSelectOpportunity={setSelectedOpportunity}
                />
              )}
            </div>
          </div>
        </div>

        <NotificationsPanel
          open={notificationsOpen}
          items={notifications}
          onClose={() => setNotificationsOpen(false)}
          onDismiss={handleDismissNotification}
        />
      </div>
    </DashboardLayout>
  );
}
