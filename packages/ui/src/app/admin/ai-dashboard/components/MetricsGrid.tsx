'use client';

import { PriceChart, type PricePoint } from './PriceChart';
import { VolumeChart, type VolumePoint } from './VolumeChart';
import { LiquidityGauge } from './LiquidityGauge';
import { AlertsBadges } from './AlertsBadges';

interface MetricsGridProps {
  priceSeries: PricePoint[];
  volumeSeries: VolumePoint[];
  liquidityUsd: number;
  priceUsd: number;
  alerts?: { volumeSpike?: boolean; txSpike?: boolean };
}

export function MetricsGrid({ priceSeries, volumeSeries, liquidityUsd, priceUsd, alerts }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <PriceChart data={priceSeries} />
      </div>
      <LiquidityGauge liquidityUsd={liquidityUsd} priceUsd={priceUsd} />
      <div className="lg:col-span-2">
        <VolumeChart data={volumeSeries} />
      </div>
      <AlertsBadges alerts={alerts} />
    </div>
  );
}
