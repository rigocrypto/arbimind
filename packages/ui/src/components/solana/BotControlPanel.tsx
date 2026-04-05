'use client';

import { useState, useCallback } from 'react';
import { API_BASE } from '@/lib/apiConfig';
import { getAdminKey } from '@/lib/adminApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BotMode = 'paper' | 'live' | 'stopped';

export interface BotStatus {
  ok: boolean;
  mode: BotMode;
  network: 'devnet' | 'mainnet';
  walletBalance: number;
  treasuryBalance: number;
  walletAddress: string | null;
  scanActive: boolean;
  opportunitiesFound: number;
  tradesExecuted: number;
  successRate: number;
  totalPnlSol: number;
  lastScanMs: number;
  lastScanAt: number;
  totalScans: number;
  lastQuoteAge: number;
  isExecuting: boolean;
  minProfitBps: number;
  activePairs: string[];
  skippedPairs: string[];
  queue: QueueItem[];
  tradeHistory: TradeRecord[];
  logs: LogEntry[];
}

export interface QueueItem {
  id: string;
  pair: string;
  spreadBps: number;
  expectedProfitSol: number;
  route: string;
  confidence: 'high' | 'medium' | 'low';
  detectedAt: number;
  status: 'detected' | 'executing' | 'completed' | 'skipped';
  result?: {
    mode: 'paper' | 'live';
    pnlSol: number;
    gasSol: number;
    txSignature?: string;
    error?: string;
  };
}

export interface TradeRecord {
  id: string;
  oppId: string;
  pair: string;
  mode: 'paper' | 'live';
  spreadBps: number;
  expectedProfitSol: number;
  actualPnlSol: number;
  gasSol: number;
  netPnlSol: number;
  status: 'success' | 'failed';
  txSignature?: string;
  error?: string;
  executedAt: number;
}

export interface LogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

// ---------------------------------------------------------------------------
// Readiness checks
// ---------------------------------------------------------------------------

interface ReadinessCheck {
  label: string;
  ok: boolean;
  detail: string;
}

function computeReadiness(status: BotStatus | null): ReadinessCheck[] {
  if (!status) {
    return [
      { label: 'Wallet funded', ok: false, detail: 'Loading...' },
      { label: 'Treasury funded', ok: false, detail: 'Loading...' },
      { label: 'RPC connected', ok: false, detail: 'Loading...' },
      { label: 'DEX quotes', ok: false, detail: 'Loading...' },
      { label: 'Bot loop', ok: false, detail: 'Loading...' },
      { label: 'Settings loaded', ok: false, detail: 'Loading...' },
      { label: 'Active pairs', ok: false, detail: 'Loading...' },
    ];
  }
  return [
    {
      label: 'Wallet funded',
      ok: status.walletBalance > 0.05,
      detail: `${status.walletBalance.toFixed(4)} SOL`,
    },
    {
      label: 'Treasury funded',
      ok: status.treasuryBalance > 0.1,
      detail: `${status.treasuryBalance.toFixed(4)} SOL`,
    },
    {
      label: 'RPC connected',
      ok: status.ok,
      detail: status.ok ? 'Connected' : 'Unavailable',
    },
    {
      label: 'DEX quotes',
      ok: status.lastQuoteAge < 30_000,
      detail:
        status.lastQuoteAge === Infinity
          ? 'No quotes yet'
          : `${(status.lastQuoteAge / 1000).toFixed(0)}s ago`,
    },
    {
      label: 'Bot loop',
      ok: status.scanActive,
      detail: status.scanActive ? 'Running' : 'Stopped',
    },
    {
      label: 'Settings loaded',
      ok: true,
      detail: 'OK',
    },
    {
      label: 'Active pairs',
      ok: (status.activePairs?.length ?? 0) >= 2,
      detail:
        (status.activePairs?.length ?? 0) < 2
          ? `${status.activePairs?.length ?? 0} — low coverage`
          : `${status.activePairs?.length ?? 0}/${(status.activePairs?.length ?? 0) + (status.skippedPairs?.length ?? 0)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BotControlPanelProps {
  status: BotStatus | null;
  onRefresh: () => void;
}

export function BotControlPanel({ status, onRefresh }: BotControlPanelProps) {
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const checks = computeReadiness(status);
  const walletFunded = status ? status.walletBalance > 0.05 : false;
  const currentMode: BotMode = status?.mode ?? 'stopped';
  const isRunning = status?.scanActive ?? false;

  const sendControl = useCallback(
    async (action: string, extra?: Record<string, string>) => {
      setActionLoading(action);
      try {
        const adminKey = getAdminKey();
        const res = await fetch(`${API_BASE}/solana/bot-control`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(adminKey ? { 'X-ADMIN-KEY': adminKey } : {}),
          },
          body: JSON.stringify({ action, ...extra }),
        });
        await res.json();
        onRefresh();
      } catch {
        // silent — status poll will catch up
      } finally {
        setActionLoading(null);
      }
    },
    [onRefresh]
  );

  const handleModeSwitch = useCallback(
    (mode: 'paper' | 'live') => {
      if (mode === 'live') {
        setShowLiveModal(true);
        return;
      }
      void sendControl('set-mode', { mode });
    },
    [sendControl]
  );

  const confirmLive = useCallback(() => {
    setShowLiveModal(false);
    void sendControl('set-mode', { mode: 'live', confirm: 'ENABLE_LIVE_DEVNET' });
  }, [sendControl]);

  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 p-4 space-y-4 relative">
      {/* DEVNET badge — persistent top-right */}
      <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold rounded bg-orange-600/30 text-orange-300 uppercase tracking-wider">
        DEVNET
      </span>

      {/* LIVE mode persistent banner */}
      {currentMode === 'live' && (
        <div className="bg-orange-600/20 border border-orange-500/40 rounded-lg px-3 py-2 text-orange-300 text-xs font-medium">
          ⚠️ LIVE DEVNET — Real transactions are being executed
        </div>
      )}

      <h3 className="text-sm font-semibold text-dark-100">Bot Control</h3>

      {/* Readiness checklist */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {checks.map((c) => (
          <div
            key={c.label}
            className={`flex items-center gap-1.5 px-2 py-1 rounded ${
              c.ok ? 'bg-green-900/20 text-green-400' : 'bg-dark-700 text-dark-400'
            }`}
          >
            <span>{c.ok ? '✅' : '⬜'}</span>
            <span className="font-medium">{c.label}</span>
            <span className="ml-auto opacity-70">{c.detail}</span>
          </div>
        ))}
      </div>

      {/* Mode selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-dark-400">Mode:</span>
        {(['paper', 'live'] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={!isRunning || actionLoading !== null}
            onClick={() => handleModeSwitch(m)}
            className={`px-3 py-1 text-xs rounded font-medium transition ${
              currentMode === m
                ? m === 'live'
                  ? 'bg-orange-600/30 text-orange-300 border border-orange-500/40'
                  : 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                : 'bg-dark-700 text-dark-400 hover:text-dark-200'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {m.toUpperCase()}
          </button>
        ))}
        {currentMode !== 'stopped' && (
          <span
            className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${
              currentMode === 'live'
                ? 'bg-orange-600/30 text-orange-300'
                : 'bg-blue-600/30 text-blue-300'
            }`}
          >
            {currentMode === 'live' ? '🔴 LIVE' : '📝 PAPER'}
          </span>
        )}
      </div>

      {/* Start / Stop */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isRunning || !walletFunded || actionLoading !== null}
          onClick={() => void sendControl('start')}
          className="px-4 py-1.5 text-xs rounded font-medium bg-green-600/20 text-green-300 hover:bg-green-600/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {actionLoading === 'start' ? 'Starting...' : 'Start Bot'}
        </button>
        <button
          type="button"
          disabled={!isRunning || actionLoading !== null}
          onClick={() => void sendControl('stop')}
          className="px-4 py-1.5 text-xs rounded font-medium bg-red-600/20 text-red-300 hover:bg-red-600/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {actionLoading === 'stop' ? 'Stopping...' : 'Stop Bot'}
        </button>
      </div>

      {/* Quick stats */}
      {status && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-dark-700/50 rounded px-2 py-1">
            <div className="text-dark-400">Scans</div>
            <div className="text-dark-100 font-medium">{status.totalScans}</div>
          </div>
          <div className="bg-dark-700/50 rounded px-2 py-1">
            <div className="text-dark-400">Trades</div>
            <div className="text-dark-100 font-medium">{status.tradesExecuted}</div>
          </div>
          <div className="bg-dark-700/50 rounded px-2 py-1">
            <div className="text-dark-400">PnL</div>
            <div
              className={`font-medium ${
                status.totalPnlSol >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {status.totalPnlSol >= 0 ? '+' : ''}
              {status.totalPnlSol.toFixed(6)} SOL
            </div>
          </div>
        </div>
      )}

      {/* Live mode confirmation modal */}
      {showLiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-800 border border-orange-500/40 rounded-xl p-6 max-w-md mx-4 space-y-4">
            <h4 className="text-orange-300 font-semibold text-sm">
              ⚠️ Enable live execution on DEVNET?
            </h4>
            <div className="text-xs text-dark-300 space-y-1">
              <div>
                <strong>Network:</strong> Solana Devnet
              </div>
              <div>
                <strong>Wallet:</strong>{' '}
                {status?.walletAddress
                  ? `${status.walletAddress.slice(0, 6)}...${status.walletAddress.slice(-4)}`
                  : 'Unknown'}
              </div>
              <div>
                <strong>Balance:</strong> {status?.walletBalance.toFixed(4) ?? '?'} SOL
              </div>
              <div className="mt-2 text-orange-300/80">
                This will execute real transactions on devnet.
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowLiveModal(false)}
                className="px-3 py-1.5 text-xs rounded bg-dark-700 text-dark-300 hover:text-dark-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLive}
                className="px-3 py-1.5 text-xs rounded bg-orange-600/30 text-orange-300 font-medium hover:bg-orange-600/40"
              >
                Enable LIVE Mode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
