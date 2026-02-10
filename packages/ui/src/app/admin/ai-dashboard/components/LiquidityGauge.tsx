'use client';

import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

interface LiquidityGaugeProps {
  liquidityUsd: number;
  priceUsd: number;
}

export function LiquidityGauge({ liquidityUsd, priceUsd }: LiquidityGaugeProps) {
  const ratio = priceUsd > 0 ? Math.min(1, liquidityUsd / (priceUsd * 10000)) : 0;
  const data = [{ name: 'liquidity', value: ratio * 100 }];

  return (
    <div className="card">
      <div className="text-white font-semibold mb-3">Liquidity Ratio</div>
      <div className="h-56 flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart innerRadius="60%" outerRadius="90%" data={data} startAngle={180} endAngle={-180}>
            <RadialBar dataKey="value" fill="#8b5cf6" cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute text-center">
          <div className="text-2xl font-bold text-white">{ratio === 0 ? '—' : `${(ratio * 100).toFixed(1)}%`}</div>
          <div className="text-xs text-dark-400">liq/price</div>
        </div>
      </div>
    </div>
  );
}
