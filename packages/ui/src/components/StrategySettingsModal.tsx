'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { HelpTooltip } from '@/components/HelpTooltip';

interface StrategySettingsModalProps {
  strategyName: string;
  isOpen: boolean;
  onClose: () => void;
  initialMinProfit?: number;
  initialRiskLevel?: string;
  initialMaxGas?: number;
}

export function StrategySettingsModal({
  strategyName,
  isOpen,
  onClose,
  initialMinProfit = 0.01,
  initialRiskLevel = 'medium',
  initialMaxGas = 50,
}: StrategySettingsModalProps) {
  const [minProfit, setMinProfit] = useState(initialMinProfit);
  const [riskLevel, setRiskLevel] = useState(initialRiskLevel);
  const [maxGas, setMaxGas] = useState(initialMaxGas);

  const handleSave = () => {
    // TODO: Save to API
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-start sm:items-center justify-center pt-4 sm:pt-0 p-3 sm:p-4 overscroll-contain"
      style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}
    >
      <div
        className="absolute inset-0 z-[9998] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative z-[9999] w-full max-w-md max-h-[90vh] min-h-0 flex flex-col rounded-xl bg-dark-800 border border-dark-600 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-dark-700 flex-shrink-0">
          <h3 id="settings-modal-title" className="text-base sm:text-lg font-bold text-white truncate pr-2">
            {strategyName} Settings
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 sm:p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors flex items-center justify-center -mr-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-sm font-medium text-dark-300">
                Min Profit (ETH)
              </label>
              <HelpTooltip content="Min profit threshold. Arbitrage: 0.01 ETH. MM: 0.005 ETH. Higher = safer, fewer trades." />
            </div>
            <input
              type="range"
              min="0.001"
              max="0.1"
              step="0.001"
              value={minProfit}
              onChange={(e) => setMinProfit(parseFloat(e.target.value))}
              className="w-full h-3 sm:h-2 rounded-lg appearance-none cursor-pointer accent-cyan-500 bg-dark-700 touch-manipulation"
            />
            <div className="text-xs text-dark-400 mt-1">{minProfit.toFixed(3)} ETH</div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-sm font-medium text-dark-300">
                Risk Level
              </label>
              <HelpTooltip content="Low: Conservative slippage/gas. High: Aggressive for rare opps." />
            </div>
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value)}
              className="w-full px-3 py-3 sm:py-2 rounded-lg bg-dark-700 border border-dark-600 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 min-h-[44px] sm:min-h-0 text-base sm:text-sm touch-manipulation"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-sm font-medium text-dark-300">
                Max Gas (Gwei)
              </label>
              <HelpTooltip content="Gas cap. Under 50 for mainnet opps, 100 for competitive." />
            </div>
            <input
              type="number"
              min="1"
              max="500"
              value={maxGas}
              onChange={(e) => setMaxGas(Number(e.target.value) || 50)}
              className="w-full px-3 py-3 sm:py-2 rounded-lg bg-dark-700 border border-dark-600 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 min-h-[44px] sm:min-h-0 text-base sm:text-sm touch-manipulation"
            />
          </div>

          {/* Best Settings Tips */}
          <div className="mt-4 p-4 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
            <h4 className="text-sm font-semibold text-cyan-400 mb-2">Best settings</h4>
            <ul className="list-disc list-inside text-xs text-dark-300 space-y-1">
              <li>Min Profit: 0.01 ETH (safe)</li>
              <li>Risk: Medium (balanced)</li>
              <li>Gas: 50 Gwei (mainnet opps)</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-3 sm:p-4 border-t border-dark-700 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 sm:py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-3 sm:py-2 min-h-[44px] sm:min-h-0 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors font-medium touch-manipulation"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : null;
}
