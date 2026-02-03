'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Settings, Brain } from 'lucide-react';
import { useAccount } from 'wagmi';
import { formatETH } from '@/utils/format';
import type { Strategy } from '@/hooks/useArbiApi';
import { StrategySettingsModal } from '@/components/StrategySettingsModal';
import { CompactSparkline } from '@/components/Charts/CompactSparkline';

const STRATEGY_COLORS: Record<string, { bg: string; border: string; text: string; dot: string; ring: string; gradient: 'cyan' | 'purple' | 'green' | 'orange' }> = {
  arbitrage: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/30', text: 'text-cyan-400', dot: 'bg-cyan-500', ring: 'focus:ring-cyan-500/50', gradient: 'cyan' as const },
  trend: { bg: 'bg-purple-500/20', border: 'border-purple-500/30', text: 'text-purple-400', dot: 'bg-purple-500', ring: 'focus:ring-purple-500/50', gradient: 'purple' as const },
  'market-making': { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-400', dot: 'bg-green-500', ring: 'focus:ring-green-500/50', gradient: 'green' as const },
};
const DEFAULT_COLOR = { bg: 'bg-amber-500/20', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-500', ring: 'focus:ring-amber-500/50', gradient: 'orange' as const };

interface StrategyCardProps {
  strategy: Strategy;
  onRun?: (id: string) => void;
  onToggleAuto?: (id: string, enabled: boolean) => void;
  /** When set, overrides strategy.active to reflect real engine state */
  engineActiveStrategy?: string;
  /** Optional sparkline data for mini-chart */
  sparklineData?: number[];
  /** Optional risk level: Low | Med | High */
  riskLevel?: string;
}

export function StrategyCard({ strategy, onRun, onToggleAuto, engineActiveStrategy }: StrategyCardProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { isConnected } = useAccount();
  const allocationPercent = strategy.allocationBps / 100;
  const isActive = engineActiveStrategy !== undefined
    ? strategy.id === engineActiveStrategy
    : (strategy.active && strategy.status === 'active');
  const isPositive = strategy.lastPnl >= 0;
  const successRate = strategy.successRate ?? Math.round(allocationPercent);
  const sentiment = strategy.sentiment ?? 0.75;
  const color = STRATEGY_COLORS[strategy.id] ?? DEFAULT_COLOR;

  const riskColor = riskLevel === 'Low' ? 'text-green-400' : riskLevel === 'Med' ? 'text-amber-400' : 'text-red-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`glass-card p-4 sm:p-5 space-y-3 compact max-w-sm w-full border ${color.border} hover:shadow-lg hover:shadow-cyan-500/5 transition-shadow`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
          <div className={`
            w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
            ${isActive ? color.bg : 'bg-dark-700/50'}
          `}>
            <div className={`
              w-2.5 h-2.5 rounded-full
              ${isActive ? `${color.dot} animate-pulse` : 'bg-dark-500'}
            `} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-white truncate">{strategy.name}</h3>
            <p className="text-xs text-dark-400 capitalize">{strategy.status}</p>
          </div>
        </div>
      </div>

      {/* Stats row: Success %, Profit, AI Conf */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-lg bg-dark-800/50 text-center">
          <div className="text-xs text-dark-400">Success</div>
          <div className="text-sm font-bold text-white">{successRate}%</div>
        </div>
        <div className="p-2 rounded-lg bg-dark-800/50 text-center">
          <div className="text-xs text-dark-400">Profit</div>
          <div className={`text-sm font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '+' : ''}{formatETH(strategy.lastPnl)} ETH
          </div>
        </div>
        <div className="p-2 rounded-lg bg-dark-800/50 text-center flex flex-col items-center justify-center">
          <div className="flex items-center gap-1">
            <Brain className="w-3 h-3 text-cyan-400" />
            <span className="text-xs text-dark-400">AI Conf</span>
          </div>
          <div className="text-sm font-bold text-cyan-400">{Math.round(sentiment * 100)}%</div>
        </div>
      </div>

      {/* Risk badge */}
      {riskLevel && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-dark-400">Risk</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${riskColor}`}>{riskLevel}</span>
        </div>
      )}

      {/* Mini sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="h-10 -mx-1">
          <CompactSparkline data={sparklineData} gradient={color.gradient} height={40} />
        </div>
      )}

      {/* Allocation */}
      <div className="flex items-center justify-between py-2 px-2 rounded-lg bg-dark-800/30">
        <span className="text-xs text-dark-400">Allocation</span>
        <span className="text-sm font-bold text-white">{allocationPercent.toFixed(0)}%</span>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => isConnected && onRun?.(strategy.id)}
          disabled={!isConnected}
          title={!isConnected ? 'Connect wallet first' : undefined}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 transition-all duration-200
            ${!isConnected
              ? 'bg-dark-700/50 border-dark-600 text-dark-500 cursor-not-allowed opacity-60'
              : `${color.bg} hover:opacity-90 ${color.border} ${color.text} ${color.ring} cursor-pointer`
            }`}
        >
          <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">{isConnected ? 'Run Now' : 'Connect to Run'}</span>
          <span className="sm:hidden">{isConnected ? 'Run' : 'Connect'}</span>
        </button>
        <button
          type="button"
          onClick={() => isConnected && onToggleAuto?.(strategy.id, !isActive)}
          disabled={!isConnected}
          title={!isConnected ? 'Connect wallet first' : undefined}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 transition-all duration-200
            ${!isConnected
              ? 'bg-dark-700/50 border-dark-600 text-dark-500 cursor-not-allowed opacity-60'
              : isActive
                ? 'bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-400 focus:ring-red-500/50 cursor-pointer'
                : 'bg-green-500/20 hover:bg-green-500/30 border-green-500/30 text-green-400 focus:ring-green-500/50 cursor-pointer'
            }`}
        >
          {isActive ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          <span className="hidden sm:inline">{isConnected ? (isActive ? 'Pause' : 'Auto') : 'Connect first'}</span>
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="px-3 py-2 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-dark-300 hover:text-white transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-dark-500/50 flex-shrink-0"
          aria-label="Settings"
        >
          <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>

      <StrategySettingsModal
        strategyName={strategy.name}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </motion.div>
  );
}
