'use client';

import React from 'react';
import { CompactSparkline } from './Charts/CompactSparkline';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  sparklineData?: number[];
  variant?: 'default' | 'accent';
  gradient?: 'cyan' | 'purple' | 'green' | 'orange' | 'pink';
}

const gradients = {
  cyan: 'from-cyan-500/20 to-cyan-600/20 border-cyan-500/30',
  purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/30',
  green: 'from-green-500/20 to-emerald-600/20 border-green-500/30',
  orange: 'from-orange-500/20 to-amber-600/20 border-orange-500/30',
  pink: 'from-pink-500/20 to-rose-600/20 border-pink-500/30',
};

export function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  subtitle,
  sparklineData,
  variant = 'default',
  gradient = 'cyan' 
}: MetricCardProps) {
  const isAccent = variant === 'accent';
  
  return (
    <div className={`
      relative overflow-hidden rounded-xl p-4 sm:p-6
      ${isAccent ? 'glass-card' : `bg-gradient-to-br ${gradients[gradient]} border backdrop-blur-sm`}
      hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300
    `}>
      {/* Animated glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <p className="text-xs sm:text-sm font-medium text-dark-300 uppercase tracking-wider">
            {title}
          </p>
          {Icon && (
            <div className={`
              p-2 rounded-lg
              ${gradient === 'cyan' ? 'bg-cyan-500/20' : ''}
              ${gradient === 'purple' ? 'bg-purple-500/20' : ''}
              ${gradient === 'green' ? 'bg-green-500/20' : ''}
              ${gradient === 'orange' ? 'bg-orange-500/20' : ''}
              ${gradient === 'pink' ? 'bg-pink-500/20' : ''}
            `}>
              <Icon className={`
                w-5 h-5
                ${gradient === 'cyan' ? 'text-cyan-400' : ''}
                ${gradient === 'purple' ? 'text-purple-400' : ''}
                ${gradient === 'green' ? 'text-green-400' : ''}
                ${gradient === 'orange' ? 'text-orange-400' : ''}
                ${gradient === 'pink' ? 'text-pink-400' : ''}
              `} />
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-baseline space-x-2">
            <h3 className="text-2xl sm:text-3xl font-bold text-white" aria-live="polite">
              {value}
            </h3>
          </div>
          {subtitle && (
            <p className="text-xs text-dark-400">{subtitle}</p>
          )}
        </div>

        {/* Sparkline chart - compact, fits card */}
        {sparklineData && sparklineData.length > 0 && (
          <div className="mt-3 sm:mt-4 h-10 sm:h-12 overflow-hidden">
            <CompactSparkline data={sparklineData} gradient={gradient} height={40} />
          </div>
        )}
      </div>
    </div>
  );
}
