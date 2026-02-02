'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 z-[9998] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative z-[9999] w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-dark-800 border border-dark-600 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 className="text-lg font-bold text-white">{strategyName} Settings</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Min Profit (ETH)
            </label>
            <input
              type="range"
              min="0.001"
              max="0.1"
              step="0.001"
              value={minProfit}
              onChange={(e) => setMinProfit(parseFloat(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-500 bg-dark-700"
            />
            <div className="text-xs text-dark-400 mt-1">{minProfit.toFixed(3)} ETH</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Risk Level
            </label>
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Max Gas (Gwei)
            </label>
            <input
              type="number"
              min="1"
              max="500"
              value={maxGas}
              onChange={(e) => setMaxGas(Number(e.target.value) || 50)}
              className="w-full px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-dark-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
