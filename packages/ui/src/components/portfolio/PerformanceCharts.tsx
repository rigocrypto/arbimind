'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatUSD, formatPercent } from '@/utils/format';
import type { TimeseriesPoint } from '@/hooks/usePortfolio';

interface PerformanceChartsProps {
  points: TimeseriesPoint[];
  /** When set, charts show "Est." to indicate approximated values */
  method?: 'estimated_linear_ramp_to_current_equity';
  isLoading: boolean;
}

const formatTs = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function PerformanceCharts({ points, method, isLoading }: PerformanceChartsProps) {
  const isEstimated = method === 'estimated_linear_ramp_to_current_equity';
  const chartData = useMemo(() => {
    return points.map((p) => ({
      ...p,
      label: formatTs(p.ts),
    }));
  }, [points]);

  const EquityTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value?: unknown }[]; label?: string }) => {
    if (!active || !payload?.length || !label) return null;
    const v = Number(payload[0]?.value ?? 0);
    return (
      <div className="rounded-lg border border-dark-600 bg-dark-800/95 px-3 py-2 shadow-xl backdrop-blur">
        <div className="text-xs text-dark-400">{label}</div>
        <div className="text-sm font-bold text-white">{formatUSD(v)}</div>
        {isEstimated && <div className="text-[10px] text-dark-500 mt-1">Estimated history — final point is live equity</div>}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="glass-card p-4 sm:p-6 animate-pulse">
        <div className="h-6 w-40 bg-dark-700 rounded mb-4" />
        <div className="h-48 bg-dark-700 rounded mb-4" />
        <div className="h-6 w-32 bg-dark-700 rounded mb-4" />
        <div className="h-48 bg-dark-700 rounded" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="glass-card p-4 sm:p-6">
        <h3 className="text-lg font-bold text-white mb-4">Performance Charts</h3>
        <div className="h-48 flex items-center justify-center text-dark-400 text-sm">
          No timeseries data yet. Deposit to arb account to see charts.
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 sm:p-6 space-y-6">
      <h3 className="text-lg font-bold text-white">Performance</h3>

      {/* Equity curve */}
      <div>
        <div className="text-sm font-medium text-dark-400 mb-2">
          Equity curve {isEstimated && <span className="text-dark-500">(Est.)</span>}
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
              <XAxis
                dataKey="label"
                axisLine={{ stroke: '#374151' }}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickLine={{ stroke: '#374151' }}
              />
              <YAxis
                dataKey="equityUsd"
                axisLine={{ stroke: '#374151' }}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickLine={{ stroke: '#374151' }}
                tickFormatter={(v) => formatUSD(v)}
              />
              <Tooltip content={<EquityTooltip />} />
              <Line
                type="monotone"
                dataKey="equityUsd"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily P&L */}
      <div>
        <div className="text-sm font-medium text-dark-400 mb-2">
          Daily P&L {isEstimated && <span className="text-dark-500">(Est.)</span>}
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
              <XAxis
                dataKey="label"
                axisLine={{ stroke: '#374151' }}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickLine={{ stroke: '#374151' }}
              />
              <YAxis
                dataKey="pnlUsd"
                axisLine={{ stroke: '#374151' }}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickLine={{ stroke: '#374151' }}
                tickFormatter={(v) => formatUSD(v)}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length || !label) return null;
                  const v = Number(payload[0]?.value ?? 0);
                  return (
                    <div className="rounded-lg border border-dark-600 bg-dark-800/95 px-3 py-2 shadow-xl backdrop-blur">
                      <div className="text-xs text-dark-400">{label}</div>
                      <div
                        className={`text-sm font-bold ${
                          v >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {v >= 0 ? '+' : ''}{formatUSD(v)}
                      </div>
                      {isEstimated && <div className="text-[10px] text-dark-500 mt-1">Estimated history — final point is live equity</div>}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="pnlUsd"
                fill="#22d3ee"
                radius={[4, 4, 0, 0]}
                fillOpacity={0.7}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Drawdown */}
      <div>
        <div className="text-sm font-medium text-dark-400 mb-2">
          Drawdown {isEstimated && <span className="text-dark-500">(Est.)</span>}
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
              <XAxis
                dataKey="label"
                axisLine={{ stroke: '#374151' }}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickLine={{ stroke: '#374151' }}
              />
              <YAxis
                dataKey="drawdownPct"
                axisLine={{ stroke: '#374151' }}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickLine={{ stroke: '#374151' }}
                tickFormatter={(v) => `${v?.toFixed(1) ?? 0}%`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length || !label) return null;
                  const v = Number(payload[0]?.value ?? 0);
                  return (
                    <div className="rounded-lg border border-dark-600 bg-dark-800/95 px-3 py-2 shadow-xl backdrop-blur">
                      <div className="text-xs text-dark-400">{label}</div>
                      <div className="text-sm font-bold text-red-400">
                        {formatPercent(-Math.abs(v))}
                      </div>
                      {isEstimated && <div className="text-[10px] text-dark-500 mt-1">Estimated history — final point is live equity</div>}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="drawdownPct"
                stroke="#ef4444"
                fill="url(#ddGrad)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
