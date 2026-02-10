'use client';

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend, Line } from 'recharts';

interface AvgReturnChartProps {
  data: Array<Record<string, number | string | null>>;
  models: string[];
}

const COLORS = ['#38bdf8', '#f97316', '#22c55e', '#a855f7', '#eab308', '#14b8a6'];

export function AvgReturnChart({ data, models }: AvgReturnChartProps) {
  const showMedian = data.some((row) => row.medianReturnPct != null);

  return (
    <div className="card">
      <div className="text-white font-semibold mb-3">Avg return (%)</div>
      {data.length === 0 || models.length === 0 ? (
        <div className="text-sm text-dark-400">No accuracy data yet.</div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#374151" strokeDasharray="3 3" opacity={0.4} />
              <XAxis dataKey="horizon" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={{ stroke: '#374151' }} tickLine={{ stroke: '#374151' }} />
              <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={{ stroke: '#374151' }} tickLine={{ stroke: '#374151' }} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(value) => (value == null ? '—' : `${Number(value).toFixed(2)}%`)}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              {models.map((model, idx) => (
                <Bar key={model} dataKey={model} fill={COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
              {showMedian && (
                <Line type="monotone" dataKey="medianReturnPct" stroke="#f59e0b" strokeWidth={2} dot={false} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
