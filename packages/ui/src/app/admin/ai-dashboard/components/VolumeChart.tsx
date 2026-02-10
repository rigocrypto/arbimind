'use client';

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';

export interface VolumePoint {
  name: string;
  volume: number;
}

interface VolumeChartProps {
  data: VolumePoint[];
}

export function VolumeChart({ data }: VolumeChartProps) {
  return (
    <div className="card">
      <div className="text-white font-semibold mb-3">Volume (USD)</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#374151" strokeDasharray="3 3" opacity={0.4} />
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={{ stroke: '#374151' }} tickLine={{ stroke: '#374151' }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={{ stroke: '#374151' }} tickLine={{ stroke: '#374151' }} />
            <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
            <Bar dataKey="volume" fill="#22d3ee" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
