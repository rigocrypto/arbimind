'use client';

import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { History, TrendingUp, TrendingDown, Clock, ExternalLink, Search } from 'lucide-react';
import { formatETH, formatUSD } from '@/utils/format';
import { useState } from 'react';

interface Trade {
  id: string;
  timestamp: Date;
  type: 'arbitrage' | 'market-making' | 'trend';
  tokenPair: string;
  profit: number;
  profitUsd: number;
  gasUsed: number;
  status: 'success' | 'failed';
  txHash?: string;
}

export default function HistoryPage() {
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Mock data - replace with real API call
  const trades: Trade[] = [];

  const filteredTrades = trades.filter(trade => {
    if (filter !== 'all' && trade.status !== filter) return false;
    if (searchQuery && !trade.tokenPair.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <DashboardLayout currentPath="/history">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="glass-card p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Trading History
              </h1>
              <p className="text-dark-300 text-sm sm:text-base">
                View all your arbitrage trades, profits, and transaction details.
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                type="text"
                placeholder="Search by token pair..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-dark-800 border border-dark-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>
            
            {/* Status Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  filter === 'all'
                    ? 'bg-cyan-500/20 border border-cyan-500/50 text-cyan-400'
                    : 'bg-dark-800 border border-dark-700 text-dark-300 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('success')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  filter === 'success'
                    ? 'bg-green-500/20 border border-green-500/50 text-green-400'
                    : 'bg-dark-800 border border-dark-700 text-dark-300 hover:text-white'
                }`}
              >
                Success
              </button>
              <button
                onClick={() => setFilter('failed')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  filter === 'failed'
                    ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                    : 'bg-dark-800 border border-dark-700 text-dark-300 hover:text-white'
                }`}
              >
                Failed
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Total Trades</div>
            <div className="text-2xl font-bold text-white">{trades.length}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Total Profit</div>
            <div className="text-2xl font-bold text-green-400">
              {formatETH(trades.reduce((sum, t) => sum + (t.profit || 0), 0))}
            </div>
            <div className="text-xs text-dark-400 mt-1">
              {formatUSD(trades.reduce((sum, t) => sum + (t.profitUsd || 0), 0))}
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs text-dark-400 mb-1">Success Rate</div>
            <div className="text-2xl font-bold text-cyan-400">
              {trades.length > 0
                ? Math.round((trades.filter(t => t.status === 'success').length / trades.length) * 100)
                : 0}%
            </div>
          </div>
        </div>

        {/* Trades List */}
        {filteredTrades.length === 0 ? (
          <div className="glass-card p-8 sm:p-12 text-center">
            <History className="w-16 h-16 mx-auto mb-4 text-dark-400" />
            <h2 className="text-xl font-bold text-white mb-2">No Trading History</h2>
            <p className="text-dark-400">
              Your arbitrage trades will appear here once you start trading.
            </p>
          </div>
        ) : (
          <div className="glass-card p-4 sm:p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-dark-400">Time</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-dark-400">Type</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-dark-400">Pair</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-dark-400">Profit</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-dark-400">Gas</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-dark-400">Status</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-dark-400">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((trade) => (
                    <tr key={trade.id} className="border-b border-dark-800/50 hover:bg-dark-800/30 transition">
                      <td className="py-3 px-4 text-sm text-dark-300">
                        {trade.timestamp.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-sm text-white capitalize">{trade.type}</td>
                      <td className="py-3 px-4 text-sm text-white font-medium">{trade.tokenPair}</td>
                      <td className="py-3 px-4 text-sm text-right">
                        <div className={`font-semibold ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.profit >= 0 ? '+' : ''}{formatETH(trade.profit)}
                        </div>
                        <div className="text-xs text-dark-400">{formatUSD(trade.profitUsd)}</div>
                      </td>
                      <td className="py-3 px-4 text-sm text-right text-dark-300">
                        {formatETH(trade.gasUsed)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                            trade.status === 'success'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {trade.status === 'success' ? (
                            <>
                              <TrendingUp className="w-3 h-3 mr-1" />
                              Success
                            </>
                          ) : (
                            <>
                              <TrendingDown className="w-3 h-3 mr-1" />
                              Failed
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {trade.txHash && (
                          <a
                            href={`https://etherscan.io/tx/${trade.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-cyan-400 hover:text-cyan-300 transition"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

