'use client';

import { motion } from 'framer-motion';
import type { ComponentType } from 'react';
import { DollarSign, TrendingUp, Activity, BarChart3 } from 'lucide-react';

interface Stat {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  trend?: string;
}

const stats: Stat[] = [
  { icon: DollarSign, label: 'Total Profit', value: '$0.00 ETH', trend: '+12.5%' },
  { icon: TrendingUp, label: 'Success Rate', value: '0.0%', trend: '+2.3%' },
  { icon: Activity, label: 'Active Strategies', value: '0', trend: undefined },
  { icon: BarChart3, label: 'Daily PnL', value: '+$0.00', trend: '+8.7%' },
];

export function StatsTicker() {
  return (
    <section className="relative py-8 bg-dark-800/50 border-y border-purple-500/20 overflow-hidden">
      <motion.div
        className="flex gap-8"
        animate={{
          x: [0, -50],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear"
        }}
      >
        {[...stats, ...stats, ...stats].map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="flex items-center gap-4 min-w-[250px] px-6 py-4 rounded-lg bg-gradient-to-r from-dark-700/50 to-dark-800/50 border border-purple-500/20 backdrop-blur-sm"
            >
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Icon className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-dark-400 uppercase tracking-wider">{stat.label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-lg font-bold text-white">{stat.value}</p>
                  {stat.trend && (
                    <span className="text-sm text-green-400">{stat.trend}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </motion.div>
    </section>
  );
}

