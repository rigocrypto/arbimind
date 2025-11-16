'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause } from 'lucide-react';
import { fadeIn } from '@/lib/animations';

export function DashboardPreview() {
  const [isPlaying, setIsPlaying] = useState(true);

  const mockTrades = [
    { pair: 'WETH/USDC', profit: '+0.0234 ETH', status: 'executed' },
    { pair: 'USDC/USDT', profit: '+0.0156 ETH', status: 'executed' },
    { pair: 'WBTC/ETH', profit: '+0.0089 ETH', status: 'pending' },
  ];

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          variants={fadeIn}
          className="text-center mb-12"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-teal-400 bg-clip-text text-transparent">
            Live Dashboard Preview
          </h2>
          <p className="text-dark-400 text-lg">
            Real-time arbitrage execution and profit tracking
          </p>
        </motion.div>

        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          variants={fadeIn}
          className="relative rounded-2xl bg-gradient-to-br from-dark-800/80 to-dark-900/80 border border-purple-500/30 backdrop-blur-sm overflow-hidden"
        >
          {/* Mock Dashboard UI */}
          <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white">ArbiMind Dashboard</h3>
                <p className="text-dark-400">Live trading activity</p>
              </div>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-3 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-400 transition-colors"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
            </div>

            {/* Mock Trades Table */}
            <div className="space-y-3">
              {mockTrades.map((trade, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.2 }}
                  className="flex items-center justify-between p-4 rounded-lg bg-dark-700/50 border border-purple-500/10"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${trade.status === 'executed' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                    <span className="text-white font-medium">{trade.pair}</span>
                  </div>
                  <span className="text-green-400 font-bold">{trade.profit}</span>
                </motion.div>
              ))}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              {[
                { label: 'Total Profit', value: '$0.00' },
                { label: 'Success Rate', value: '0.0%' },
                { label: 'Total Trades', value: '0' },
                { label: 'Gas Used', value: '0 ETH' },
              ].map((stat, index) => (
                <div
                  key={index}
                  className="p-4 rounded-lg bg-dark-700/30 border border-purple-500/10"
                >
                  <p className="text-xs text-dark-400 mb-1">{stat.label}</p>
                  <p className="text-lg font-bold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

