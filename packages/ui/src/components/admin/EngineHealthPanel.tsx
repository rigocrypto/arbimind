'use client';

import { Activity, Wifi, Clock, Search } from 'lucide-react';

interface EngineHealthPanelProps {
  engineDetail: {
    active: string;
    walletChain: string | null;
    walletAddress: string | null;
    oppsCount: number;
    lastProfit: number;
    lastScanAt: number | null;
    uptime: number;
    timestamp: number;
  } | null;
  rpcHealth: {
    ok: boolean;
    health: Record<string, string>;
    details: Record<string, { status: string; rpcUrl: string | null; latencyMs?: number; error?: string }>;
  } | null;
  engineBlocked: boolean;
  blockedReason?: string;
  engineMode?: 'simulation' | 'live' | 'unknown';
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

function formatTimeAgo(ts: number | null): string {
  if (!ts) return 'Never';
  const ms = Date.now() - ts;
  if (ms < 5000) return 'Just now';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  return `${Math.floor(ms / 3600000)}h ago`;
}

const MODE_BADGE: Record<string, { label: string; className: string }> = {
  simulation: { label: 'SIMULATION', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  live: { label: 'LIVE', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  unknown: { label: 'UNKNOWN', className: 'bg-dark-600 text-dark-400 border-dark-500' },
};

export function EngineHealthPanel({ engineDetail, rpcHealth, engineBlocked, blockedReason, engineMode }: EngineHealthPanelProps) {
  const evmLatency = rpcHealth?.details?.evm?.latencyMs;
  const solLatency = rpcHealth?.details?.solana?.latencyMs;
  const badge = MODE_BADGE[engineMode ?? 'unknown'];
  const isRunning = !!engineDetail?.active;

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-cyan-400" />
        Engine Health
        <span className={`ml-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
          {isRunning ? 'RUNNING' : 'STOPPED'} ({badge.label})
        </span>
      </h3>

      {engineBlocked && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          Engine blocked: {blockedReason || 'SIMULATED_ENGINE_ENABLED not set to true'}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-dark-400 uppercase tracking-wider mb-1">
            <Clock className="w-3 h-3" /> Last Scan
          </div>
          <div className="text-sm font-medium text-white">
            {formatTimeAgo(engineDetail?.lastScanAt ?? null)}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs text-dark-400 uppercase tracking-wider mb-1">
            <Search className="w-3 h-3" /> Opportunities
          </div>
          <div className="text-sm font-medium text-white">
            {engineDetail?.oppsCount ?? '—'}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs text-dark-400 uppercase tracking-wider mb-1">
            <Wifi className="w-3 h-3" /> RPC Latency
          </div>
          <div className="text-sm font-medium text-white">
            {evmLatency != null ? `EVM: ${evmLatency}ms` : 'EVM: —'}
            {solLatency != null ? ` · SOL: ${solLatency}ms` : ''}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs text-dark-400 uppercase tracking-wider mb-1">
            <Activity className="w-3 h-3" /> Uptime
          </div>
          <div className="text-sm font-medium text-white">
            {engineDetail?.uptime != null ? formatUptime(engineDetail.uptime) : '—'}
          </div>
        </div>
      </div>

      {engineDetail?.active && (
        <div className="mt-4 pt-4 border-t border-dark-600">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-dark-400">Active strategy:</span>{' '}
              <span className="text-cyan-400 font-medium">{engineDetail.active || 'None'}</span>
            </div>
            <div>
              <span className="text-dark-400">Last profit:</span>{' '}
              <span className="text-green-400 font-medium">
                {engineDetail.lastProfit != null ? `${engineDetail.lastProfit.toFixed(4)} SOL` : '—'}
              </span>
            </div>
            {engineDetail.walletChain && engineDetail.walletAddress && (
              <div>
                <span className="text-dark-400">Wallet:</span>{' '}
                <span className="text-white font-mono text-xs">
                  {engineDetail.walletChain}:{engineDetail.walletAddress.slice(0, 8)}...
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
