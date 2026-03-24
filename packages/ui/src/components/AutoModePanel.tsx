'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Bot, Shield, Wallet } from 'lucide-react';

interface AutoModePanelProps {
  isEnabled: boolean;
  maxRiskPct: number;
  maxTradeSizeEth: number;
  onRiskChange: (next: number) => void;
  onTradeSizeChange: (next: number) => void;
  onToggle: (next: boolean) => Promise<void> | void;
  disabled?: boolean;
}

export function AutoModePanel({
  isEnabled,
  maxRiskPct,
  maxTradeSizeEth,
  onRiskChange,
  onTradeSizeChange,
  onToggle,
  disabled,
}: AutoModePanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const stateCopy = useMemo(
    () =>
      isEnabled
        ? 'Engine can execute opportunities autonomously using your configured limits.'
        : 'Engine is manual-only. Enable auto mode to allow autonomous execution.',
    [isEnabled]
  );

  const handleToggle = () => {
    if (disabled) return;

    if (!isEnabled) {
      setConfirmOpen(true);
      return;
    }

    void onToggle(false);
  };

  return (
    <section
      className={[
        'glass-card p-4 transition-all duration-150',
        isEnabled
          ? 'border-green-400/40 shadow-[0_0_30px_rgba(0,230,118,0.16)]'
          : 'border-white/10',
      ].join(' ')}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Bot className="h-4 w-4 text-cyan-300" />
            AUTO ARBITRAGE
          </h3>
          <p className="mt-1 text-xs text-dark-300">{stateCopy}</p>
        </div>

        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className={[
            'relative inline-flex h-8 w-20 items-center rounded-full border px-1 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50',
            isEnabled
              ? 'border-green-400/50 bg-green-500/20 scan-pulse'
              : 'border-white/20 bg-dark-800/80',
          ].join(' ')}
          aria-label="Toggle auto arbitrage mode"
        >
          <span
            className={[
              'absolute text-[10px] font-semibold tracking-wide',
              isEnabled ? 'left-2 text-green-200' : 'right-2 text-dark-300',
            ].join(' ')}
          >
            {isEnabled ? 'ON' : 'OFF'}
          </span>
          <span
            className={[
              'h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-150',
              isEnabled ? 'translate-x-12' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <label htmlFor="auto-risk" className="mb-2 flex items-center justify-between text-xs text-dark-300">
            <span className="inline-flex items-center gap-1">
              <Shield className="h-3.5 w-3.5 text-amber-300" />
              Max Risk / Trade
            </span>
            <span className="font-mono text-white">{maxRiskPct.toFixed(1)}%</span>
          </label>
          <input
            id="auto-risk"
            type="range"
            min={0.5}
            max={10}
            step={0.1}
            value={maxRiskPct}
            onChange={(event) => onRiskChange(Number(event.target.value))}
            className="w-full accent-cyan-400"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <label htmlFor="auto-size" className="mb-2 flex items-center justify-between text-xs text-dark-300">
            <span className="inline-flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5 text-cyan-300" />
              Max Trade Size
            </span>
            <span className="font-mono text-white">{maxTradeSizeEth.toFixed(3)} ETH</span>
          </label>
          <input
            id="auto-size"
            type="number"
            min={0.01}
            step={0.01}
            value={maxTradeSizeEth}
            onChange={(event) => onTradeSizeChange(Number(event.target.value) || 0)}
            className="w-full rounded-lg border border-dark-600 bg-dark-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-dark-900 p-5 shadow-2xl">
            <h4 className="mb-2 flex items-center gap-2 text-lg font-semibold text-white">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              Enable Auto Arbitrage?
            </h4>
            <p className="text-sm text-dark-300">
              Auto mode will allow the engine to execute trades without additional confirmation, bounded by your risk settings.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-white/20 px-3 py-2 text-sm text-dark-200 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  void onToggle(true);
                }}
                className="rounded-lg bg-green-500/20 px-3 py-2 text-sm font-medium text-green-200 hover:bg-green-500/30"
              >
                Enable Auto Mode
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
