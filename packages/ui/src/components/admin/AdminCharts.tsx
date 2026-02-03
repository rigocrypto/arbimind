'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
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
  Legend,
} from 'recharts';
import { format } from 'date-fns';

const COLORS = ['#22c55e', '#06b6d4', '#8b5cf6'];

interface AdminChartsProps {
  pnlSeries: { time: number; netProfit: number; gasCost: number }[];
  txsByStrategy: { strategy: string; profit: number }[];
  range: '24h' | '7d' | '30d';
}

export function AdminCharts({ pnlSeries, txsByStrategy, range }: AdminChartsProps) {
  const pnlData = useMemo(() => {
    return pnlSeries
      .map((p) => ({
        ...p,
        timeStr: range === '24h' ? format(p.time, 'HH:mm') : format(p.time, 'MM/dd'),
      }))
      .slice(-50);
  }, [pnlSeries, range]);

  const gasData = useMemo(() => {
    return pnlSeries
      .map((p) => ({
        time: range === '24h' ? format(p.time, 'HH:mm') : format(p.time, 'MM/dd'),
        gas: p.gasCost,
      }))
      .slice(-20);
  }, [pnlSeries, range]);

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
    if (!active || !payload?.length || !label) return null;
    return (
      <div className="rounded-lg border border-dark-600 bg-dark-800/95 px-3 py-2 shadow-xl">
        <div className="text-xs text-dark-400">{label}</div>
        <div className="text-sm font-bold text-white">{payload[0]?.value?.toFixed(4) ?? 0} ETH</div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4">Net P&L Over Time</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pnlData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="adminPnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="timeStr" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.toFixed(3)} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="netProfit" stroke="#22c55e" fill="url(#adminPnlGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h3 className="text-lg font-semibold text-white mb-4">Gas Cost Over Time</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gasData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.toFixed(4)} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="gas" fill="#f97316" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card lg:col-span-2">
        <h3 className="text-lg font-semibold text-white mb-4">Strategy Share of Profit</h3>
        <div className="h-48 flex items-center justify-center">
          {txsByStrategy.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={txsByStrategy}
                  dataKey="profit"
                  nameKey="strategy"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={({ strategy, profit }) => `${strategy}: ${profit.toFixed(3)} ETH`}
                >
                  {txsByStrategy.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `${v.toFixed(4)} ETH`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-dark-500 text-sm">No strategy data</div>
          )}
        </div>
      </div>
    </div>
  );
}
