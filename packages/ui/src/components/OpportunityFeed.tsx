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
  onSelectOpportunity?: (opportunity: Opportunity) => void;
}

// Component to display relative time (avoids hydration errors)
function RelativeTime({ timestamp }: { timestamp: number | string | Date }) {
  const relativeTime = useRelativeTime(timestamp);
  return <span className="text-xs text-dark-400">{relativeTime}</span>;
}

export function OpportunityFeed({ opportunities, onExecute, onSelectOpportunity }: OpportunityFeedProps) {
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
    } catch {
      toast.error('Execution failed');
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[#111625]/95 p-4 backdrop-blur sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Zap className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white sm:text-lg">Live Opportunity Feed</h3>
          </div>
          <span className="rounded bg-dark-800/50 px-2 py-1 text-xs text-dark-400">
            {opportunities.length} opportunities
          </span>
        </div>
      </div>

      {opportunities.length === 0 ? (
        <div className="px-4 py-8 text-center text-dark-400 sm:px-6 sm:py-12">
          <div className="flex flex-col items-center space-y-2">
            <Zap className="h-12 w-12 text-dark-600" />
            <p>No opportunities detected</p>
            <p className="text-xs">Waiting for arbitrage opportunities...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2.5 p-3 sm:hidden">
            {opportunities.map((opp) => {
              const isExecuting = executingId === opp.id;
              const showConfirmModal = showConfirm === opp.id;
              const positive = opp.netGain > 0;
              return (
                <div
                  key={opp.id}
                  className={[
                    'rounded-xl border border-l-4 p-3',
                    positive ? 'border-l-emerald-400/80 border-white/10 bg-white/5' : 'border-l-red-400/70 border-white/10 bg-white/5',
                  ].join(' ')}
                  onClick={() => onSelectOpportunity?.(opp)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-white">{opp.pair}</p>
                      <p className="mt-0.5 text-xs text-dark-400">{opp.fromDex} &rarr; {opp.toDex}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${opp.profitPct > 0 ? 'text-green-400' : 'text-red-400'}`}>{formatPercent(opp.profitPct)}</p>
                      <p className={`text-xs font-semibold ${positive ? 'text-green-400' : 'text-red-400'}`}>
                        {positive ? '+' : ''}{formatETH(opp.netGain)} ETH
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded-md bg-dark-900/50 px-2 py-1.5">
                      <p className="text-[10px] uppercase text-dark-500">Profit</p>
                      <p className="text-xs font-semibold text-white">{formatETH(opp.profitEth)} ETH</p>
                    </div>
                    <div className="rounded-md bg-dark-900/50 px-2 py-1.5">
                      <p className="text-[10px] uppercase text-dark-500">Gas</p>
                      <p className="text-xs font-semibold text-dark-300">{formatETH(opp.gasEst)} ETH</p>
                    </div>
                    <div className="rounded-md bg-dark-900/50 px-2 py-1.5">
                      <p className="text-[10px] uppercase text-dark-500">Age</p>
                      <RelativeTime timestamp={opp.timestamp} />
                    </div>
                  </div>

                  <div className="mt-3">
                    {showConfirmModal ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleExecute(opp.id);
                          }}
                          disabled={isExecuting}
                          className="min-h-[40px] rounded-lg border border-green-500/30 bg-green-500/20 px-3 py-2 text-xs font-medium text-green-400 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setShowConfirm(null);
                          }}
                          className="min-h-[40px] rounded-lg border border-dark-600 bg-dark-700/50 px-3 py-2 text-xs font-medium text-dark-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isConnected) {
                            toast.error('Connect wallet to execute!');
                            return;
                          }
                          if (!checkBalance()) return;
                          setShowConfirm(opp.id);
                        }}
                        disabled={isExecuting || !isConnected}
                        className="min-h-[40px] w-full rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 px-3 py-2 text-xs font-medium text-cyan-400 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : isConnected ? 'Execute' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px]" aria-label="Arbitrage opportunities">
              <thead className="border-b border-white/10 bg-dark-800/50">
                <tr>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 sm:px-6">Pair</th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 md:table-cell sm:px-6">Route</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 sm:px-6">Profit %</th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 sm:table-cell sm:px-6">Profit</th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 lg:table-cell sm:px-6">Gas</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 sm:px-6">Net Gain</th>
                  <th className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 md:table-cell sm:px-6">Age</th>
                  <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-dark-400 sm:px-6">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {opportunities.map((opp) => {
                  const isExecuting = executingId === opp.id;
                  const showConfirmModal = showConfirm === opp.id;

                  return (
                    <tr
                      key={opp.id}
                      className="cursor-pointer transition-colors duration-200 hover:bg-cyan-500/5"
                      onClick={() => onSelectOpportunity?.(opp)}
                    >
                      <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                        <span className="text-sm font-medium text-white">{opp.pair}</span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-4 md:table-cell sm:px-6">
                        <div className="flex items-center space-x-2 text-sm">
                          <span className="text-dark-400">{opp.fromDex}</span>
                          <ArrowRight className="h-4 w-4 text-cyan-400" />
                          <span className="text-white">{opp.toDex}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                        <span className={`text-sm font-bold ${opp.profitPct > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPercent(opp.profitPct)}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-4 sm:table-cell sm:px-6">
                        <span className="text-sm font-medium text-white">{formatETH(opp.profitEth)} ETH</span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-4 lg:table-cell sm:px-6">
                        <span className="text-sm text-dark-400">{formatETH(opp.gasEst)} ETH</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                        <span className={`text-sm font-bold ${opp.netGain > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {opp.netGain > 0 ? '+' : ''}{formatETH(opp.netGain)} ETH
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-4 md:table-cell sm:px-6">
                        <RelativeTime timestamp={opp.timestamp} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 sm:px-6">
                        {showConfirmModal ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleExecute(opp.id);
                              }}
                              disabled={isExecuting}
                              className="rounded-lg border border-green-500/30 bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setShowConfirm(null);
                              }}
                              className="rounded-lg border border-dark-600 bg-dark-700/50 px-3 py-1.5 text-xs font-medium text-dark-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!isConnected) {
                                toast.error('Connect wallet to execute!');
                                return;
                              }
                              if (!checkBalance()) return;
                              setShowConfirm(opp.id);
                            }}
                            disabled={isExecuting || !isConnected}
                            title={!isConnected ? 'Connect wallet first' : undefined}
                            className="rounded-lg border border-cyan-500/30 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 px-3 py-1.5 text-xs font-medium text-cyan-400 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : isConnected ? 'Execute' : 'Connect'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
