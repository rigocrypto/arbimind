'use client';

import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { StrategyCard } from '@/components/StrategyCard';
import { useStrategies } from '@/hooks/useArbiApi';
import { useEngineContext } from '@/contexts/EngineContext';
import { Brain, Plus, TrendingUp, Activity } from 'lucide-react';
import { useState } from 'react';

export default function StrategiesPage() {
  const { strategies, loading } = useStrategies();
  const { start, stop, activeStrategy, checkBalance } = useEngineContext();
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);

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

  return (
    <DashboardLayout currentPath="/strategies">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="glass-card p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                AI Trading Strategies
              </h1>
              <p className="text-dark-300 text-sm sm:text-base">
                Configure and manage your arbitrage trading strategies powered by AI.
              </p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:opacity-90 transition">
              <Plus className="w-4 h-4" />
              <span>New Strategy</span>
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Total Strategies</div>
            <div className="text-2xl font-bold text-white">{strategies.length}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Active</div>
            <div className="text-2xl font-bold text-green-400">
              {strategies.filter(s => s.active).length}
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Total Profit</div>
            <div className="text-2xl font-bold text-white">0.00 ETH</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Success Rate</div>
            <div className="text-2xl font-bold text-cyan-400">0%</div>
          </div>
        </div>

        {/* Strategies Grid */}
        {loading ? (
          <div className="glass-card p-8 sm:p-12 text-center text-dark-400">
            <div className="animate-pulse">Loading strategies...</div>
          </div>
        ) : strategies.length === 0 ? (
          <div className="glass-card p-8 sm:p-12 text-center">
            <Brain className="w-16 h-16 mx-auto mb-4 text-dark-400" />
            <h2 className="text-xl font-bold text-white mb-2">No Strategies Yet</h2>
            <p className="text-dark-400 mb-6">Create your first AI trading strategy to start arbitrage trading.</p>
            <button className="flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-medium hover:opacity-90 transition mx-auto">
              <Plus className="w-5 h-5" />
              <span>Create Strategy</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {strategies.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                onRun={handleRun}
                onToggleAuto={handleToggleAuto}
                engineActiveStrategy={activeStrategy}
              />
            ))}
          </div>
        )}

        {/* Strategy Types Info */}
        <div className="glass-card p-4 sm:p-6">
          <h3 className="text-lg font-bold text-white mb-4">Available Strategy Types</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-cyan-400" />
                <h4 className="font-semibold text-white">Arbitrage V2/V3</h4>
              </div>
              <p className="text-sm text-dark-400">
                Detects price differences between Uniswap V2 and V3 pools for instant profit opportunities.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-purple-400" />
                <h4 className="font-semibold text-white">Market Making</h4>
              </div>
              <p className="text-sm text-dark-400">
                Provides liquidity to DEX pools and earns fees from price spreads and volatility.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <h4 className="font-semibold text-white">Trend Following</h4>
              </div>
              <p className="text-sm text-dark-400">
                AI-powered strategy that follows market trends and momentum for optimal entry/exit points.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

