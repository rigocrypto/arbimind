'use client';

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

export interface ConfidenceRadarData {
  confidence: number;
  liquidity: number;
  risk: number;
  speed: number;
}

interface AIConfidenceRadarProps {
  data: ConfidenceRadarData;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function AIConfidenceRadar({ data }: AIConfidenceRadarProps) {
  const chartData = [
    { metric: 'Confidence', value: clamp(data.confidence) },
    { metric: 'Liquidity', value: clamp(data.liquidity) },
    { metric: 'Risk', value: clamp(100 - data.risk) },
    { metric: 'Speed', value: clamp(data.speed) },
  ];

  const composite = Math.round(
    (clamp(data.confidence) + clamp(data.liquidity) + clamp(100 - data.risk) + clamp(data.speed)) / 4
  );

  return (
    <section className="glass-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-dark-200">AI Confidence Radar</h3>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-200">
          {composite}% composite
        </span>
      </div>

      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={10} minHeight={10}>
          <RadarChart data={chartData} outerRadius="70%">
            <PolarGrid stroke="rgba(148, 163, 184, 0.25)" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fill: 'rgba(226, 232, 240, 0.85)', fontSize: 11 }}
            />
            <Radar
              name="AI"
              dataKey="value"
              stroke="#00e5cc"
              fill="#00e5cc"
              fillOpacity={0.3}
              strokeWidth={2}
              animationDuration={450}
              isAnimationActive
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
