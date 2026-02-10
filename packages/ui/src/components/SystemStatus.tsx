'use client';

import type { ComponentType } from 'react';
import { useState } from 'react';
import { Activity, Server, Wifi, Database, Zap, CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useHealth } from '@/hooks/useArbiApi';
import { useRelativeTime } from '@/hooks/useRelativeTime';

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
  'Blockchain RPC': Database,
};

export function SystemStatus() {
  const { health } = useHealth();
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Mock services based on health status
  const services: ServiceStatus[] = [
    {
      name: 'Backend API',
      status: health.status === 'ok' ? 'healthy' : health.status === 'degraded' ? 'degraded' : 'down',
      latency: 145,
      lastCheck: Date.now(),
    },
    {
      name: 'Bot Engine',
      status: health.status === 'ok' ? 'healthy' : 'degraded',
      latency: 120,
      lastCheck: Date.now() - 5000,
    },
    {
      name: 'WebSocket',
      status: 'healthy',
      latency: 45,
      lastCheck: Date.now() - 2000,
    },
    {
      name: 'Strategy Manager',
      status: 'healthy',
      latency: 89,
      lastCheck: Date.now() - 3000,
    },
    {
      name: 'Blockchain RPC',
      status: 'healthy',
      latency: 234,
      lastCheck: Date.now() - 1000,
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
        {services.map((service) => {
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
      </div>

      {/* Diagnostics panel */}
      {showDiagnostics && (
        <div className="mt-6 p-4 rounded-lg bg-dark-800/50 border border-dark-700">
          <h4 className="text-sm font-medium text-white mb-3">System Logs</h4>
          <div className="space-y-2 font-mono text-xs text-dark-400">
            <div>[{new Date().toISOString()}] Backend API: Connected</div>
            <div>[{new Date(Date.now() - 5000).toISOString()}] Bot Engine: Running</div>
            <div>[{new Date(Date.now() - 10000).toISOString()}] WebSocket: 127 connections</div>
            <div>[{new Date(Date.now() - 15000).toISOString()}] Strategy Manager: 3 strategies active</div>
            <div>[{new Date(Date.now() - 20000).toISOString()}] RPC: Ethereum mainnet synced</div>
          </div>
        </div>
      )}
    </div>
  );
}
