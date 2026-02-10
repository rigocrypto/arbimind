'use client';

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from 'recharts';

interface HitRateChartProps {
  data: Array<Record<string, number | string | null>>;
  models: string[];
}

const COLORS = ['#22c55e', '#38bdf8', '#f97316', '#a855f7', '#eab308', '#14b8a6'];

export function HitRateChart({ data, models }: HitRateChartProps) {
  return (
    <div className="card">
      <div className="text-white font-semibold mb-3">Hit rate (%)</div>
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
                formatter={(value) => (value == null ? '—' : `${Number(value).toFixed(1)}%`)}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              {models.map((model, idx) => (
                <Bar key={model} dataKey={model} fill={COLORS[idx % COLORS.length]} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-3 text-xs text-dark-400">
        Hit rate is calculated on resolved predictions only (resolved at horizon). Unresolved predictions are excluded.
        Correct = direction matches realized return over the horizon.
      </div>
    </div>
  );
}
