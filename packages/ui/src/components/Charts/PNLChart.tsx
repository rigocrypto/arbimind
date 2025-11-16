'use client';

import { useMemo } from 'react';
import { formatETH } from '@/utils/format';

interface PNLChartProps {
  data: number[];
  timestamps: number[];
  height?: number;
}

export function PNLChart({ data, timestamps, height = 200 }: PNLChartProps) {
  const chartData = useMemo(() => {
    if (!data.length || !timestamps.length) return null;

    const max = Math.max(...data, 0);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const width = 100;
    const step = width / (data.length - 1 || 1);

    const points = data.map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    const areaPoints = [
      `0,${height}`,
      ...data.map((value, index) => {
        const x = index * step;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
      }),
      `${width},${height}`,
    ].join(' ');

    return { points, areaPoints, max, min };
  }, [data, timestamps, height]);

  if (!chartData || !data.length) {
    return (
      <div className="flex items-center justify-center h-full text-dark-400">
        <p>No data available</p>
      </div>
    );
  }

  const lastValue = data[data.length - 1];
  const isPositive = lastValue >= 0;

  return (
    <div className="relative w-full" style={{ height: `${height}px` }}>
      <svg
        viewBox={`0 0 100 ${height}`}
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* Gradient definitions */}
        <defs>
          <linearGradient id="pnlGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop
              offset="0%"
              stopColor={isPositive ? 'rgba(10, 242, 155, 0.3)' : 'rgba(239, 68, 68, 0.3)'}
            />
            <stop
              offset="100%"
              stopColor={isPositive ? 'rgba(10, 242, 155, 0)' : 'rgba(239, 68, 68, 0)'}
            />
          </linearGradient>
        </defs>

        {/* Area fill */}
        <polyline
          points={chartData.areaPoints}
          fill="url(#pnlGradient)"
          className="transition-opacity duration-300"
        />

        {/* Line */}
        <polyline
          points={chartData.points}
          fill="none"
          stroke={isPositive ? '#0af29b' : '#ef4444'}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-300"
        />
      </svg>

      {/* Value overlay */}
      <div className="absolute top-2 right-2">
        <div className={`
          px-2 py-1 rounded text-xs font-bold
          ${isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}
        `}>
          {formatETH(lastValue)}
        </div>
      </div>
    </div>
  );
}

