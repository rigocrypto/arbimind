'use client';

import type { AlertSignal } from '@/lib/aiSignals';

const DOT: Record<string, string> = {
  green: '🟢',
  yellow: '🟡',
  red: '🔴',
};

interface AlertPanelProps {
  signals: AlertSignal[] | null;
  loaded: boolean;
}

export function AlertPanel({ signals, loaded }: AlertPanelProps) {
  if (!loaded) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-white font-semibold">AI Alerts</h2>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600/30 text-yellow-300">DEMO</span>
        </div>
        <p className="text-sm text-dark-400">Load a pair to see live alerts</p>
        <div className="mt-3 space-y-2">
          {['Volume spike detected', 'Liquidity stable', 'Whale sell pressure'].map((msg) => (
            <div key={msg} className="flex items-center gap-2 text-sm text-dark-500">
              <span>⚪</span>
              <span>{msg}</span>
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-600/30 text-yellow-300">DEMO</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!signals || signals.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-white font-semibold">AI Alerts</h2>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600/30 text-green-300">LIVE</span>
        </div>
        <p className="text-sm text-dark-400">No alerts — all clear</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-white font-semibold">AI Alerts</h2>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-600/30 text-green-300">LIVE</span>
      </div>
      <div className="space-y-2">
        {signals.map((sig, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span>{DOT[sig.level] ?? '⚪'}</span>
            <span className="text-dark-200">{sig.message}</span>
            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-600/30 text-indigo-300 uppercase">
              {sig.source}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
