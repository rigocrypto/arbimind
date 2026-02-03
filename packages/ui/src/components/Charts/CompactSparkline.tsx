'use client';

import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const GRADIENT_COLORS: Record<string, { stroke: string; fill: string }> = {
  green: { stroke: '#00ff88', fill: '#00ff88' },
  cyan: { stroke: '#22d3ee', fill: '#22d3ee' },
  purple: { stroke: '#a78bfa', fill: '#a78bfa' },
  orange: { stroke: '#fb923c', fill: '#fb923c' },
  pink: { stroke: '#f472b6', fill: '#f472b6' },
};

interface CompactSparklineProps {
  data: number[];
  gradient?: keyof typeof GRADIENT_COLORS;
  height?: number;
}

export function CompactSparkline({
  data,
  gradient = 'green',
  height = 48,
}: CompactSparklineProps) {
  const chartData = useMemo(() => {
    if (!data?.length) return [];
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    return data.map((value, i) => ({
      index: i,
      value,
      normalized: range === 0 ? 1 : (value - min) / range,
    }));
  }, [data]);

  const colors = GRADIENT_COLORS[gradient] ?? GRADIENT_COLORS.green;
  const gradientId = `sparkline-${gradient}`;

  if (!chartData.length) return null;

  return (
    <div className="w-full overflow-hidden" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.fill} stopOpacity={0.4} />
              <stop offset="100%" stopColor={colors.fill} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="normalized"
            stroke={colors.stroke}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive
            animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
