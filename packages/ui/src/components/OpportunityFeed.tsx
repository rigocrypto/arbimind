'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Zap, Loader2 } from 'lucide-react';
import { formatETH, formatPercent } from '@/utils/format';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import type { Opportunity } from '@/hooks/useArbiApi';
import { useExecute } from '@/hooks/useArbiApi';
import { useBalanceGuard } from '@/hooks/useBalanceGuard';
import { trackEvent } from '@/lib/analytics';
import { useAccount } from 'wagmi';
import toast from 'react-hot-toast';

interface OpportunityFeedProps {
  opportunities: Opportunity[];
  onExecute?: (id: string) => void;
}

// Component to display relative time (avoids hydration errors)
function RelativeTime({ timestamp }: { timestamp: number | string | Date }) {
  const relativeTime = useRelativeTime(timestamp);
  return <span className="text-xs text-dark-400">{relativeTime}</span>;
}

export function OpportunityFeed({ opportunities, onExecute }: OpportunityFeedProps) {
  const { execute } = useExecute();
  const { isConnected } = useAccount();
  const { checkBalance } = useBalanceGuard();
  const firstOpportunityTrackedRef = useRef(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (firstOpportunityTrackedRef.current || opportunities.length === 0) {
      return;
    }

    firstOpportunityTrackedRef.current = true;
    trackEvent('first_opportunity_view', {
      count: opportunities.length,
    });
  }, [opportunities.length]);

  const handleExecute = async (id: string) => {
    if (!isConnected) {
      toast.error('Connect wallet to execute!');
      return;
    }
    if (!checkBalance()) return; // Toast from useBalanceGuard (0.05 ETH)
    setShowConfirm(null);
    setExecutingId(id);
    try {
      const result = await execute(id);
      if (result.ok) {
        onExecute?.(id);
        toast.success(`Executed! Tx: ${result.txHash?.slice(0, 10)}...`);
      } else {
        toast.error(result.error ?? 'Execution failed');
      }
    } catch (error) {
      toast.error('Execution failed');
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Zap className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white">Live Opportunity Feed</h3>
          </div>
          <span className="text-xs text-dark-400 px-2 py-1 rounded bg-dark-800/50">
            {opportunities.length} opportunities
          </span>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full min-w-[640px]" aria-label="Arbitrage opportunities">
          <thead className="bg-dark-800/50 border-b border-white/10">
            <tr>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">
                Pair
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider hidden md:table-cell">
                Route
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">
                Profit %
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider hidden sm:table-cell">
                Profit
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider hidden lg:table-cell">
                Gas
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">
                Net Gain
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider hidden md:table-cell">
                Age
              </th>
              <th className="px-3 sm:px-6 py-2 sm:py-3 text-left text-xs font-medium text-dark-400 uppercase tracking-wider">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {opportunities.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 sm:px-6 py-8 sm:py-12 text-center text-dark-400">
                  <div className="flex flex-col items-center space-y-2">
                    <Zap className="w-12 h-12 text-dark-600" />
                    <p>No opportunities detected</p>
                    <p className="text-xs">Waiting for arbitrage opportunities...</p>
                  </div>
                </td>
              </tr>
            ) : (
              opportunities.map((opp) => {
                const isExecuting = executingId === opp.id;
                const showConfirmModal = showConfirm === opp.id;

                return (
                  <tr
                    key={opp.id}
                    className="hover:bg-cyan-500/5 transition-colors duration-200"
                  >
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <span className="text-xs sm:text-sm font-medium text-white">{opp.pair}</span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden md:table-cell">
                      <div className="flex items-center space-x-2 text-xs sm:text-sm">
                        <span className="text-dark-400">{opp.fromDex}</span>
                        <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-cyan-400" />
                        <span className="text-white">{opp.toDex}</span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <span className={`text-xs sm:text-sm font-bold ${
                        opp.profitPct > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercent(opp.profitPct)}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden sm:table-cell">
                      <span className="text-xs sm:text-sm font-medium text-white">
                        {formatETH(opp.profitEth)} ETH
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden lg:table-cell">
                      <span className="text-xs sm:text-sm text-dark-400">
                        {formatETH(opp.gasEst)} ETH
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <span className={`text-xs sm:text-sm font-bold ${
                        opp.netGain > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {opp.netGain > 0 ? '+' : ''}{formatETH(opp.netGain)} ETH
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap hidden md:table-cell">
                      <RelativeTime timestamp={opp.timestamp} />
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      {showConfirmModal ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleExecute(opp.id)}
                            disabled={isExecuting}
                            className="px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500/50"
                          >
                            {isExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowConfirm(null)}
                            className="px-3 py-1.5 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-dark-300 text-xs font-medium transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-dark-500/50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (!isConnected) {
                              toast.error('Connect wallet to execute!');
                              return;
                            }
                            if (!checkBalance()) return;
                            setShowConfirm(opp.id);
                          }}
                          disabled={isExecuting || !isConnected}
                          title={!isConnected ? 'Connect wallet first' : undefined}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-400 hover:from-cyan-500/30 hover:to-purple-500/30 transition-all duration-200 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        >
                          {isExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : isConnected ? 'Execute' : 'Connect'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
