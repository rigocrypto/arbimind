'use client';

import { Play, Pause, Settings } from 'lucide-react';
import { formatETH, formatPercent } from '@/utils/format';
import type { Strategy } from '@/hooks/useArbiApi';

interface StrategyCardProps {
  strategy: Strategy;
  onRun?: (id: string) => void;
  onToggleAuto?: (id: string, enabled: boolean) => void;
}

export function StrategyCard({ strategy, onRun, onToggleAuto }: StrategyCardProps) {
  const allocationPercent = strategy.allocationBps / 100;
  const isActive = strategy.active && strategy.status === 'active';
  const isPositive = strategy.lastPnl >= 0;

  // Calculate progress ring circumference
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (allocationPercent / 100) * circumference;

  return (
    <div className="glass-card p-4 sm:p-6 space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
          <div className={`
            w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0
            ${isActive ? 'bg-cyan-500/20' : 'bg-dark-700/50'}
          `}>
            <div className={`
              w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full
              ${isActive ? 'bg-green-500 animate-pulse' : 'bg-dark-500'}
            `} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-bold text-white truncate">{strategy.name}</h3>
            <p className="text-xs text-dark-400 capitalize">{strategy.status}</p>
          </div>
        </div>
      </div>

      {/* Allocation Progress Ring */}
      <div className="flex items-center justify-center py-3 sm:py-4">
        <div className="relative w-20 h-20 sm:w-24 sm:h-24">
          <svg className="transform -rotate-90 w-20 h-20 sm:w-24 sm:h-24" viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r="33"
              stroke="currentColor"
              strokeWidth="5"
              fill="none"
              className="text-dark-700"
            />
            <circle
              cx="40"
              cy="40"
              r="33"
              stroke="currentColor"
              strokeWidth="5"
              fill="none"
              strokeDasharray={207.35}
              strokeDashoffset={207.35 - (allocationPercent / 100) * 207.35}
              className="text-cyan-400 transition-all duration-500"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg sm:text-xl font-bold text-white">{allocationPercent.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Last PnL */}
      <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg bg-dark-800/50">
        <span className="text-xs sm:text-sm text-dark-400">Last PnL</span>
        <span className={`
          text-base sm:text-lg font-bold
          ${isPositive ? 'text-green-400' : 'text-red-400'}
        `}>
          {isPositive ? '+' : ''}{formatETH(strategy.lastPnl)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => onRun?.(strategy.id)}
          className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 transition-all duration-200 font-medium text-xs sm:text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        >
          <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">Run Now</span>
          <span className="sm:hidden">Run</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleAuto?.(strategy.id, !isActive)}
          className={`
            flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border transition-all duration-200 font-medium text-xs sm:text-sm cursor-pointer focus:outline-none focus:ring-2
            ${isActive
              ? 'bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-400 focus:ring-red-500/50'
              : 'bg-green-500/20 hover:bg-green-500/30 border-green-500/30 text-green-400 focus:ring-green-500/50'
            }
          `}
        >
          {isActive ? <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          <span className="hidden sm:inline">{isActive ? 'Pause' : 'Auto'}</span>
        </button>
        <button
          type="button"
          className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-dark-300 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-dark-500/50 flex-shrink-0"
          aria-label="Settings"
        >
          <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </div>
  );
}
