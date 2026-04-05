'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/lib/apiConfig';
import { getAdminKey } from '@/lib/adminApi';
import { BotControlPanel } from './BotControlPanel';
import { OpportunityFeed } from './OpportunityFeed';
import { BotLogsPanel } from './BotLogsPanel';
import type { BotStatus, TradeRecord } from './BotControlPanel';

// ---------------------------------------------------------------------------
// Data-fetching wrapper
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 5_000;

export function SolanaBotTab() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const adminKey = getAdminKey();
      const headers: Record<string, string> = {};
      if (adminKey) headers['X-ADMIN-KEY'] = adminKey;

      const res = await fetch(`${API_BASE}/solana/bot-status`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (mountedRef.current) {
        setStatus(data as BotStatus);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Fetch failed');
      }
    }
  }, []);

  // Poll loop
  useEffect(() => {
    mountedRef.current = true;
    const tick = () => {
      void fetchStatus().finally(() => {
        if (mountedRef.current) {
          timerRef.current = setTimeout(tick, POLL_INTERVAL);
        }
      });
    };
    tick();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchStatus]);

  return (
    <div className="space-y-4">
      {/* DEVNET badge — persistent */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Solana Devnet Bot</h2>
        <span className="px-2.5 py-1 text-[10px] font-bold rounded bg-orange-600/30 text-orange-300 uppercase tracking-wider border border-orange-500/30">
          DEVNET
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          Backend unreachable: {error}
        </div>
      )}

      {/* Control panel */}
      <BotControlPanel status={status} onRefresh={fetchStatus} />

      {/* Two-column: Opportunities | Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OpportunityFeed
          queue={status?.queue ?? []}
          totalOpps={status?.opportunitiesFound ?? 0}
          totalScans={status?.totalScans ?? 0}
          lastScanMs={status?.lastScanMs ?? 0}
        />
        <BotLogsPanel logs={status?.logs ?? []} />
      </div>

      {/* Trade history table */}
      <TradeHistoryTable trades={status?.tradeHistory ?? []} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade History Table
// ---------------------------------------------------------------------------

function TradeHistoryTable({ trades }: { trades: TradeRecord[] }) {
  if (trades.length === 0) {
    return (
      <div className="bg-dark-800 rounded-xl border border-dark-700 p-4 text-center">
        <p className="text-xs text-dark-500">No trades executed yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
      <h3 className="text-sm font-semibold text-dark-100 mb-3">Trade History</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-dark-400 border-b border-dark-700">
              <th className="text-left py-1.5 pr-3">Time</th>
              <th className="text-left py-1.5 pr-3">Pair</th>
              <th className="text-left py-1.5 pr-3">Mode</th>
              <th className="text-right py-1.5 pr-3">Spread</th>
              <th className="text-right py-1.5 pr-3">Expected</th>
              <th className="text-right py-1.5 pr-3">Actual</th>
              <th className="text-right py-1.5 pr-3">Gas</th>
              <th className="text-right py-1.5 pr-3">Net PnL</th>
              <th className="text-left py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              // CRITICAL: failed trades MUST NOT show positive PnL
              const displayPnl = t.status === 'failed' ? -Math.abs(t.gasSol) : t.netPnlSol;
              return (
                <tr key={t.id} className="border-b border-dark-700/50 hover:bg-dark-700/20">
                  <td className="py-1.5 pr-3 text-dark-400">
                    {new Date(t.executedAt).toLocaleTimeString()}
                  </td>
                  <td className="py-1.5 pr-3 font-medium text-dark-200">{t.pair}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      t.mode === 'live'
                        ? 'bg-orange-600/20 text-orange-300'
                        : 'bg-blue-600/20 text-blue-300'
                    }`}>
                      {t.mode.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-dark-300">{t.spreadBps.toFixed(1)}</td>
                  <td className="py-1.5 pr-3 text-right text-dark-300">
                    {t.expectedProfitSol.toFixed(6)}
                  </td>
                  <td className={`py-1.5 pr-3 text-right font-medium ${
                    t.actualPnlSol >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {t.actualPnlSol >= 0 ? '+' : ''}{t.actualPnlSol.toFixed(6)}
                  </td>
                  <td className="py-1.5 pr-3 text-right text-dark-400">
                    {t.gasSol.toFixed(6)}
                  </td>
                  <td className={`py-1.5 pr-3 text-right font-bold ${
                    displayPnl >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {displayPnl >= 0 ? '+' : ''}{displayPnl.toFixed(6)}
                  </td>
                  <td className="py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      t.status === 'success'
                        ? 'bg-green-600/20 text-green-300'
                        : 'bg-red-600/20 text-red-300'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
