'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
  ResponsiveContainer,
} from 'recharts';
import { formatETH, formatPercent } from '@/utils/format';

const MOCK_PNL_DATA = [
  { time: '00:00', profit: 0 },
  { time: '03:00', profit: 0.02 },
  { time: '06:00', profit: 0.04 },
  { time: '09:00', profit: 0.05 },
  { time: '12:00', profit: 0.06 },
  { time: '15:00', profit: 0.07 },
  { time: '18:00', profit: 0.09 },
  { time: '21:00', profit: 0.11 },
  { time: '23:59', profit: 0.12 },
];

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

interface PNLChartProps {
  data: number[];
  timestamps: number[];
  height?: number;
}

export function PNLChart({ data, timestamps, height }: PNLChartProps) {
  const chartData = useMemo(() => {
    if (data.length && timestamps.length && data.length === timestamps.length) {
      const start = data[0] ?? 0;
      return data.map((profit, i) => ({
        time: formatTime(timestamps[i] ?? 0),
        profit,
        profitPct: start !== 0 ? ((profit - start) / Math.abs(start)) * 100 : 0,
      }));
    }
    const start = MOCK_PNL_DATA[0].profit;
    return MOCK_PNL_DATA.map((d) => ({
      ...d,
      profitPct: start !== 0 ? ((d.profit - start) / Math.abs(start)) * 100 : d.profit * 100,
    }));
  }, [data, timestamps]);

  const lastProfit = chartData[chartData.length - 1]?.profit ?? 0;
  const firstProfit = chartData[0]?.profit ?? 0;
  const profitPct = firstProfit !== 0 ? ((lastProfit - firstProfit) / Math.abs(firstProfit)) * 100 : 0;

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: { profitPct: number } }[]; label?: string }) => {
    if (!active || !payload?.length || !label) return null;
    const profit = payload[0]?.value ?? 0;
    const pct = payload[0]?.payload?.profitPct ?? 0;
    return (
      <div className="rounded-lg border border-dark-600 bg-dark-800/95 px-3 py-2 shadow-xl backdrop-blur">
        <div className="text-xs text-dark-400">{label}</div>
        <div className="text-sm font-bold text-white">{formatETH(profit)} ETH</div>
        <div className={`text-xs font-medium ${pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {formatPercent(pct)}
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full h-full min-h-[140px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="pnlGradientStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#00ff88" />
              <stop offset="100%" stopColor="#00aa5f" />
            </linearGradient>
            <linearGradient id="pnlGradientFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00ff88" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#00aa5f" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.5} />

          <XAxis
            dataKey="time"
            axisLine={{ stroke: '#374151' }}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickLine={{ stroke: '#374151' }}
            interval="preserveStartEnd"
          />

          <YAxis
            dataKey="profit"
            axisLine={{ stroke: '#374151' }}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickLine={{ stroke: '#374151' }}
            tickFormatter={(v) => formatETH(v)}
            domain={['auto', 'auto']}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#00ff88', strokeWidth: 1, strokeDasharray: '4 4' }} />

          <Area
            type="monotone"
            dataKey="profit"
            stroke="url(#pnlGradientStroke)"
            strokeWidth={2.5}
            fill="url(#pnlGradientFill)"
            dot={{ fill: '#00aa5f', strokeWidth: 0, r: 3 }}
            activeDot={{ fill: '#00ff88', stroke: '#0a0a0a', strokeWidth: 2, r: 5 }}
            isAnimationActive
            animationDuration={800}
            animationEasing="ease-out"
          />

          <Brush
            dataKey="time"
            height={20}
            stroke="#374151"
            fill="#111827"
            travellerWidth={6}
            tickFormatter={(v) => v}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Current value badge */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <div
          className={`rounded px-2 py-1 text-xs font-bold ${
            lastProfit >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {formatETH(lastProfit)} ETH {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
