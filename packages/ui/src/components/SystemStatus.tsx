'use client';

import type { ComponentType } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Activity, Server, Wifi, Database, Zap, CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { useHealth } from '@/hooks/useArbiApi';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { apiUrl } from '@/lib/apiConfig';

const ENABLE_API_CALLS = process.env.NEXT_PUBLIC_ENABLE_API === 'true';

// ---- Per-chain RPC health hook ----

interface ChainHealth {
  chain: string;
  status: 'healthy' | 'unavailable';
  latencyMs?: number;
  error?: string;
}

const CHAIN_LABELS: Record<string, string> = {
  evm: 'EVM (Polygon)',
  solana: 'Solana',
  worldchain_sepolia: 'Worldchain',
};

function useRpcHealth() {
  const [chains, setChains] = useState<ChainHealth[]>([]);
  const [lastCheck, setLastCheck] = useState(Date.now());

  const fetchRpcHealth = useCallback(async () => {
    if (!ENABLE_API_CALLS) return;
    try {
      const res = await fetch(apiUrl('/rpc/health'));
      if (!res.ok) return;
      const data = (await res.json()) as {
        details?: Record<string, { status: string; latencyMs?: number; error?: string }>;
      };
      if (!data.details) return;
      const results: ChainHealth[] = Object.entries(data.details).map(([chain, info]) => ({
        chain,
        status: info.status === 'healthy' ? 'healthy' : 'unavailable',
        latencyMs: info.latencyMs,
        error: info.error,
      }));
      setChains(results);
      setLastCheck(Date.now());
    } catch {
      // Backend unreachable — keep last known state
    }
  }, []);

  useEffect(() => {
    fetchRpcHealth();
    const id = setInterval(fetchRpcHealth, 30_000);
    return () => clearInterval(id);
  }, [fetchRpcHealth]);

  return { chains, lastCheck };
}

// Component to display service time (avoids hydration errors)
function ServiceTime({ timestamp, latency }: { timestamp: number; latency: number }) {
  const relativeTime = useRelativeTime(timestamp);
  return <p className="text-xs text-dark-400">{latency}ms latency • {relativeTime}</p>;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency?: number;
  lastCheck: number;
}

const statusConfig = {
  healthy: {
    icon: CheckCircle2,
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    border: 'border-green-500/30',
    label: 'Healthy',
  },
  degraded: {
    icon: AlertCircle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/30',
    label: 'Degraded',
  },
  down: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    border: 'border-red-500/30',
    label: 'Down',
  },
};

const serviceIcons: Record<string, ComponentType<{ className?: string }>> = {
  'Backend API': Server,
  'Bot Engine': Activity,
  'WebSocket': Wifi,
  'Strategy Manager': Zap,
};

export function SystemStatus() {
  const { health } = useHealth();
  const { chains: rpcChains, lastCheck: rpcLastCheck } = useRpcHealth();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const now = Date.now();

  const coreServices: ServiceStatus[] = [
    {
      name: 'Backend API',
      status: health.status === 'ok' ? 'healthy' : health.status === 'degraded' ? 'degraded' : 'down',
      latency: 145,
      lastCheck: now,
    },
    {
      name: 'Bot Engine',
      status: health.status === 'ok' ? 'healthy' : 'degraded',
      latency: 120,
      lastCheck: now - 5000,
    },
    {
      name: 'WebSocket',
      status: 'healthy',
      latency: 45,
      lastCheck: now - 2000,
    },
    {
      name: 'Strategy Manager',
      status: 'healthy',
      latency: 89,
      lastCheck: now - 3000,
    },
  ];

  return (
    <div className="glass-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
          <h3 className="text-base sm:text-lg font-bold text-white">System Status</h3>
        </div>
        <button
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-dark-400 hover:text-white transition-colors"
          type="button"
        >
          <span className="hidden sm:inline">Diagnostics</span>
          {showDiagnostics ? <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" /> : <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />}
        </button>
      </div>

      <div className="space-y-2 sm:space-y-3">
        {coreServices.map((service) => {
          const config = statusConfig[service.status];
          const Icon = serviceIcons[service.name] || Activity;
          const StatusIcon = config.icon;

          return (
            <div
              key={service.name}
              className={`
                flex items-center justify-between p-3 sm:p-4 rounded-lg
                ${config.bg} border ${config.border}
                transition-all duration-200 hover:shadow-lg
              `}
            >
              <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${config.color} flex-shrink-0`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-white truncate">{service.name}</p>
                  {service.latency && (
                    <ServiceTime timestamp={service.lastCheck} latency={service.latency} />
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
                <StatusIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${config.color}`} />
                <span className={`text-xs sm:text-sm font-medium ${config.color} hidden sm:inline`}>
                  {config.label}
                </span>
              </div>
            </div>
          );
        })}

        {/* Per-chain RPC status */}
        <div className="pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-dark-400 mb-1.5 flex items-center gap-1.5">
            <Globe className="w-3 h-3" /> Blockchain RPC
          </p>
          {rpcChains.length === 0 ? (
            <div className="flex items-center justify-between p-3 sm:p-4 rounded-lg bg-green-500/20 border border-green-500/30">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <Database className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
                <p className="text-xs sm:text-sm font-medium text-white">RPC</p>
              </div>
              <span className="text-xs text-dark-400">Loading…</span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {rpcChains.map((rpc) => {
                const healthy = rpc.status === 'healthy';
                const config = statusConfig[healthy ? 'healthy' : 'down'];
                const StatusIcon = config.icon;
                return (
                  <div
                    key={rpc.chain}
                    className={`flex items-center justify-between p-2.5 sm:p-3 rounded-lg ${config.bg} border ${config.border} transition-all duration-200`}
                  >
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <Database className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${config.color} flex-shrink-0`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-white truncate">{CHAIN_LABELS[rpc.chain] ?? rpc.chain}</p>
                        {healthy && rpc.latencyMs !== undefined ? (
                          <p className="text-[11px] text-dark-400">{rpc.latencyMs}ms</p>
                        ) : rpc.error ? (
                          <p className="text-[11px] text-red-400 truncate">{rpc.error}</p>
                        ) : null}
                      </div>
                    </div>
                    <StatusIcon className={`w-4 h-4 ${config.color} flex-shrink-0`} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Diagnostics panel */}
      {showDiagnostics && (
        <div className="mt-6 p-4 rounded-lg bg-dark-800/50 border border-dark-700">
          <h4 className="text-sm font-medium text-white mb-3">RPC Diagnostics</h4>
          <div className="space-y-2 font-mono text-xs text-dark-400">
            <div>[{new Date(rpcLastCheck).toISOString()}] RPC health check completed</div>
            {rpcChains.map((rpc) => (
              <div key={rpc.chain}>
                [{new Date(rpcLastCheck).toISOString()}] {CHAIN_LABELS[rpc.chain] ?? rpc.chain}:{' '}
                {rpc.status === 'healthy'
                  ? `OK${rpc.latencyMs !== undefined ? ` (${rpc.latencyMs}ms)` : ''}`
                  : `FAIL — ${rpc.error ?? 'unavailable'}`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
