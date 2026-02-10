'use client';

import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

export interface PricePoint {
  name: string;
  priceUsd: number;
}

interface PriceChartProps {
  data: PricePoint[];
}

export function PriceChart({ data }: PriceChartProps) {
  return (
    <div className="card">
      <div className="text-white font-semibold mb-3">Price (USD)</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#374151" strokeDasharray="3 3" opacity={0.4} />
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={{ stroke: '#374151' }} tickLine={{ stroke: '#374151' }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={{ stroke: '#374151' }} tickLine={{ stroke: '#374151' }} />
            <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
            <Line type="monotone" dataKey="priceUsd" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
