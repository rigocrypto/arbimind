"use client";

import React from 'react';
import clsx from 'clsx';
import { MotionWrapper } from '@/components/animations/MotionWrapper';
import { useId } from 'react';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  gradient?: 'green' | 'cyan' | 'purple' | 'orange' | 'gold';
  sparklineData?: number[];
  loading?: boolean;
}

const gradientMap: Record<MetricCardProps['gradient'], string> = {
  green: 'from-green-400/40 to-green-600/30',
  cyan: 'from-cyan-400/40 to-cyan-600/30',
  purple: 'from-purple-400/40 to-purple-600/30',
  orange: 'from-orange-400/40 to-orange-600/30',
  gold: 'from-yellow-300/40 to-yellow-500/30',
};

function Sparkline({ data = [], color = 'currentColor' }: { data?: number[]; color?: string }) {
  if (!data || data.length < 2) {
    return <div className="h-6" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="w-full h-6" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </svg>
  );
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient = 'green',
  sparklineData,
  loading,
}) => {
  const id = useId();

  return (
    <MotionWrapper className="glass-card p-4" key={id}>
      <div className="flex items-start gap-4">
        <div className={clsx('p-2 rounded-md bg-opacity-10', gradientMap[gradient])} style={{ background: undefined }}>
          {Icon ? <Icon className="w-6 h-6 text-white/90" /> : <div className="w-6 h-6 bg-white/10 rounded" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-dark-300 truncate">{title}</div>
          </div>

          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <div className="text-xl font-semibold" aria-live="polite">
                {loading ? <span className="inline-block h-6 w-24 bg-dark-700 rounded animate-pulse" /> : value}
              </div>
              {subtitle && <div className="text-xs text-dark-400 mt-1 truncate">{subtitle}</div>}
            </div>

            <div className="w-32">
              <Sparkline data={sparklineData} color="rgba(255,255,255,0.9)" />
            </div>
          </div>
        </div>
      </div>
    </MotionWrapper>
  );
};

export default MetricCard;
