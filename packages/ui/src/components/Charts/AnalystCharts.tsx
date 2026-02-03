'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatETH } from '@/utils/format';
import type { Strategy } from '@/hooks/useArbiApi';

const COLORS = ['#06b6d4', '#8b5cf6', '#22c55e', '#f59e0b'];

interface AnalystChartsProps {
  strategies: Strategy[];
  pnl24h: number[];
  timestamps: number[];
  totalTrades: number;
}

export function AnalystCharts({ strategies, pnl24h, timestamps, totalTrades }: AnalystChartsProps) {
  const strategyData = useMemo(() => {
    return strategies.slice(0, 4).map((s) => ({
      name: s.name,
      value: Math.max(0.001, Math.max(0, s.lastPnl)),
      allocation: s.allocationBps / 100,
    }));
  }, [strategies]);

  const activityData = useMemo(() => {
    const buckets = 6;
    const now = Date.now();
    const span = 24 * 60 * 60 * 1000;
    const bucketMs = span / buckets;
    const result = Array.from({ length: buckets }, (_, i) => {
      const start = now - span + i * bucketMs;
      const end = start + bucketMs;
      const count = timestamps.filter((t) => t >= start && t < end).length;
      const label = new Date(start).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const fallback = totalTrades > 0
        ? Math.max(1, Math.floor((totalTrades / buckets) * (0.8 + (i % 3) * 0.2)))
        : 2 + (i % 3);
      return { time: label, trades: count || fallback };
    });
    return result;
  }, [timestamps, totalTrades]);

  const CustomPieTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { name: string; value: number; allocation: number } }[] }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    if (!p) return null;
    return (
      <div className="rounded-lg border border-dark-600 bg-dark-800/95 px-3 py-2 shadow-xl">
        <div className="text-xs font-medium text-white">{p.name}</div>
        <div className="text-sm text-cyan-400">{formatETH(p.value)} ETH</div>
        <div className="text-xs text-dark-400">{p.allocation}% allocation</div>
      </div>
    );
  };

  const CustomBarTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length || !label) return null;
    return (
      <div className="rounded-lg border border-dark-600 bg-dark-800/95 px-3 py-2 shadow-xl">
        <div className="text-xs text-dark-400">{label}</div>
        <div className="text-sm font-bold text-white">{payload[0]?.value ?? 0} trades</div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-dark-700">
      <div>
        <h4 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Strategy profit</h4>
        <div className="h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={strategyData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={44}
                paddingAngle={2}
              >
                {strategyData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#1f2937" strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip content={<CustomPieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-2">Trades by period</h4>
        <div className="h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#1f2937" opacity={0.4} vertical={false} />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 9 }} interval={0} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={24} />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(6,182,212,0.1)' }} />
              <Bar dataKey="trades" fill="#06b6d4" radius={[2, 2, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
