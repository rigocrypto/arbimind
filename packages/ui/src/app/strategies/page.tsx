'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { StrategyCard } from '@/components/StrategyCard';
import { useStrategies } from '@/hooks/useArbiApi';
import { useEngineContext } from '@/contexts/EngineContext';
import { Brain, Plus, Activity, HelpCircle, ChevronDown, Search, Zap, ArrowRight } from 'lucide-react';
import { createPortal } from 'react-dom';

// Enhanced mock data per prompt spec
const STRATEGY_OVERRIDES: Record<
  string,
  { lastPnl: number; successRate: number; riskLevel: string; sentiment: number; active?: boolean }
> = {
  arbitrage: { lastPnl: 0.12, successRate: 85, riskLevel: 'Low', sentiment: 0.92, active: true },
  trend: { lastPnl: 0.08, successRate: 72, riskLevel: 'Med', sentiment: 0.78, active: false },
  'market-making': { lastPnl: 0.15, successRate: 92, riskLevel: 'Low', sentiment: 0.88, active: true },
};

const AVAILABLE_TYPES = [
  {
    id: 'uni-arb',
    title: 'UNI Arbitrage',
    icon: Zap,
    color: 'text-cyan-400',
    desc: 'Exploits price differences between Uniswap V2 and V3 pools. AI predicts optimal entry timing and flash loan profitability.',
  },
  {
    id: 'sushi-arb',
    title: 'SushiSwap Arbitrage',
    icon: Activity,
    color: 'text-purple-400',
    desc: 'Cross-pool arbitrage on SushiSwap. Monitors slippage and gas costs for net-positive trades.',
  },
  {
    id: 'cross-dex',
    title: 'Cross-DEX Arbitrage',
    icon: ArrowRight,
    color: 'text-green-400',
    desc: 'Multi-DEX strategy (Uniswap, Sushi, Curve, Balancer). AI risk prediction and sentiment scoring.',
  },
];

function HelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-[99999] flex items-start sm:items-center justify-center pt-4 sm:pt-0 p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-[9999] w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-dark-800 border border-dark-600 shadow-2xl p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
      >
        <h3 id="help-modal-title" className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-cyan-400" />
          AI Strategies Guide
        </h3>

        <div className="space-y-4 text-sm text-dark-300">
          <section>
            <h4 className="font-semibold text-white mb-2">Arbitrage</h4>
            <p>
              DEX price differentials between pools. Uses flash loans when profitable. AI predicts risk and optimal execution.
            </p>
            <p className="mt-2 text-cyan-400/90">Best: Min 0.01 ETH, Low risk, 50 Gwei gas cap.</p>
          </section>
          <section>
            <h4 className="font-semibold text-white mb-2">Trend Following</h4>
            <p>
              Sentiment analysis + momentum signals. AI scores market direction for entry/exit.
            </p>
            <p className="mt-2 text-purple-400/90">Best: Medium risk, confidence threshold 75%.</p>
          </section>
          <section>
            <h4 className="font-semibold text-white mb-2">Market Making</h4>
            <p>
              Provides liquidity to DEX pools. Earns from spread and volatility. AI optimizes placement.
            </p>
            <p className="mt-2 text-green-400/90">Best: Low risk, 0.3% spread target.</p>
          </section>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 font-medium transition"
        >
          Got it
        </button>
      </motion.div>
    </div>
  );

  return createPortal(content, document.body);
}

export default function StrategiesPage() {
  const { strategies, loading } = useStrategies();
  const { start, stop, activeStrategy, activeWalletChain, activeWalletAddress, checkBalance } = useEngineContext();
  const [searchPairs, setSearchPairs] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [accordionOpen, setAccordionOpen] = useState<string | null>('uni-arb');

  const handleRun = (id: string) => {
    if (!checkBalance()) return;
    start(id);
  };
  const handleToggleAuto = (id: string, enabled: boolean) => {
    if (enabled) {
      if (!checkBalance()) return;
      start(id);
    } else stop();
  };

  // Merge API strategies with prompt mock overrides
  const displayStrategies = strategies.map((s) => {
    const over = STRATEGY_OVERRIDES[s.id];
    return over
      ? { ...s, lastPnl: over.lastPnl, successRate: over.successRate, sentiment: over.sentiment, active: over.active ?? s.active }
      : s;
  });

  // Sparkline data per strategy (mock trend)
  const getSparkline = (id: string, lastPnl: number) =>
    Array.from({ length: 10 }, (_, i) => lastPnl * (0.2 + 0.8 * (i + 1) / 10));

  return (
    <DashboardLayout currentPath="/strategies">
      <div className="space-y-4 sm:space-y-6">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 sm:p-6 lg:p-8"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                AI Trading Strategies
              </h1>
              <p className="text-dark-300 text-sm sm:text-base mb-4">
                Configure and manage arbitrage strategies powered by AI risk prediction and sentiment.
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                  <input
                    id="strategies-search"
                    name="searchPairs"
                    type="text"
                    placeholder="Search custom pairs (e.g. ETH/USDC)"
                    value={searchPairs}
                    onChange={(e) => setSearchPairs(e.target.value)}
                    autoComplete="off"
                    className="w-full bg-dark-800 border border-dark-600 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dark-600 hover:border-cyan-500/50 text-dark-400 hover:text-cyan-400 transition"
                  aria-label="Help"
                >
                  <HelpCircle className="w-5 h-5" />
                  <span className="hidden sm:inline">Help</span>
                </button>
                <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:opacity-90 transition">
                  <Plus className="w-4 h-4" />
                  <span>New Strategy</span>
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Overview */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
        >
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Total Strategies</div>
            <div className="text-2xl font-bold text-white">{displayStrategies.length}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Active</div>
            <div className="text-2xl font-bold text-green-400">
              {displayStrategies.filter((s) => s.active || s.id === activeStrategy).length}
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Total Profit</div>
            <div className="text-2xl font-bold text-white">
              {displayStrategies.reduce((a, s) => a + Math.max(0, s.lastPnl), 0).toFixed(2)} ETH
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Avg Success</div>
            <div className="text-2xl font-bold text-cyan-400">
              {displayStrategies.length
                ? Math.round(
                    displayStrategies.reduce((a, s) => a + (s.successRate ?? 0), 0) /
                      displayStrategies.length
                  )
                : 0}
              %
            </div>
          </div>
        </motion.div>

        {(activeWalletChain || activeWalletAddress) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12 }}
            className="glass-card p-4"
          >
            <p className="text-xs text-dark-400 mb-1">Engine Execution Wallet</p>
            <p className="text-sm text-white">
              {activeWalletChain ? activeWalletChain.toUpperCase() : 'UNKNOWN'}
              {activeWalletAddress ? ` · ${activeWalletAddress}` : ''}
            </p>
          </motion.div>
        )}

        {/* Strategies Grid */}
        {loading ? (
          <div className="glass-card p-8 sm:p-12 text-center text-dark-400">
            <div className="animate-pulse">Loading strategies...</div>
          </div>
        ) : displayStrategies.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card p-8 sm:p-12 text-center"
          >
            <Brain className="w-16 h-16 mx-auto mb-4 text-dark-400" />
            <h2 className="text-xl font-bold text-white mb-2">No Strategies Yet</h2>
            <p className="text-dark-400 mb-6">Create your first AI trading strategy to start.</p>
            <button className="flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:opacity-90 transition mx-auto">
              <Plus className="w-5 h-5" />
              <span>Create Strategy</span>
            </button>
          </motion.div>
        ) : (
          <div className="flex justify-center">
            <div className="inline-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {displayStrategies.map((strategy, i) => (
                <motion.div
                  key={strategy.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                >
                  <StrategyCard
                    strategy={strategy}
                    onRun={handleRun}
                    onToggleAuto={handleToggleAuto}
                    engineActiveStrategy={activeStrategy}
                    sparklineData={getSparkline(strategy.id, strategy.lastPnl)}
                    riskLevel={STRATEGY_OVERRIDES[strategy.id]?.riskLevel}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Available Types - Collapsible Accordion */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-4 sm:p-6"
        >
          <h3 className="text-lg font-bold text-white mb-4">Available Strategy Types</h3>
          <div className="space-y-2">
            {AVAILABLE_TYPES.map((item) => {
              const Icon = item.icon;
              const isOpen = accordionOpen === item.id;
              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-dark-600 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setAccordionOpen(isOpen ? null : item.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-dark-700/30 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-dark-800 ${item.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="font-semibold text-white">{item.title}</span>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 text-dark-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="px-4 pb-4 pt-0 text-sm text-dark-400">{item.desc}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Footer CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-6 text-center border border-cyan-500/20"
        >
          <p className="text-dark-300 mb-2">Ready to maximize your arbitrage edge?</p>
          <p className="text-sm text-dark-400">Connect wallet, configure strategies, and let AI work for you.</p>
        </motion.div>
      </div>

      <AnimatePresence>
        <HelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      </AnimatePresence>
    </DashboardLayout>
  );
}
