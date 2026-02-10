'use client';

import { ExternalLink, Activity } from 'lucide-react';
import { formatAddress } from '@/utils/format';

type ActivityItem =
  | { tx: string; ts: number; symbol: string; amount: string; usd?: number; type: 'deposit' }
  | { tx: string; ts: number; symbol: string; amount: string; usd?: number; type: 'withdrawal' };

interface ActivityTableProps {
  deposits: Array<{ tx: string; ts: number; symbol: string; amount: string; usd?: number }>;
  withdrawals: Array<{ tx: string; ts: number; symbol: string; amount: string; usd?: number }>;
  explorerBaseUrl: string;
  /** Optional suffix for tx URLs (e.g. ?cluster=devnet for Solana) */
  explorerTxSuffix?: string;
  isLoading?: boolean;
}

export function ActivityTable({
  deposits,
  withdrawals,
  explorerBaseUrl,
  explorerTxSuffix = '',
  isLoading = false,
}: ActivityTableProps) {
  const items: ActivityItem[] = [
    ...deposits.map((d) => ({ ...d, type: 'deposit' as const })),
    ...withdrawals.map((w) => ({ ...w, type: 'withdrawal' as const })),
  ].sort((a, b) => b.ts - a.ts);

  const txUrl = (hash: string) => {
    if (!explorerBaseUrl) return '#';
    return `${explorerBaseUrl.replace(/\/+$/, '')}/tx/${hash}${explorerTxSuffix}`;
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleString();

  if (isLoading) {
    return (
      <div className="glass-card p-4 sm:p-6 animate-pulse overflow-hidden">
        <div className="h-6 w-40 bg-dark-700 rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-dark-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 sm:p-6 overflow-hidden">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-cyan-400" />
        Recent Arb Activity
      </h3>

      {items.length === 0 ? (
        <div className="py-8 text-center text-dark-400">
          <Activity className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>No deposits or withdrawals yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] xs:min-w-[520px]">
            <thead>
              <tr className="border-b border-dark-600">
                <th className="text-left py-2 text-xs font-medium text-dark-400 uppercase">Tx</th>
                <th className="text-left py-2 text-xs font-medium text-dark-400 uppercase">Type</th>
                <th className="text-right py-2 text-xs font-medium text-dark-400 uppercase">Amount</th>
                <th className="text-right py-2 text-xs font-medium text-dark-400 uppercase">Time</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 20).map((item) => (
                <tr
                  key={`${item.tx}-${item.ts}-${item.type}`}
                  className="border-b border-dark-700/50 hover:bg-dark-800/30"
                >
                  <td className="py-3">
                    <a
                      href={txUrl(item.tx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-cyan-400 hover:underline font-mono text-sm"
                    >
                      {formatAddress(item.tx, 8, 8)}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </td>
                  <td className="py-3">
                    <span
                      className={`text-sm font-medium ${
                        item.type === 'deposit' ? 'text-green-400' : 'text-amber-400'
                      }`}
                    >
                      {item.type === 'deposit' ? 'Deposit' : 'Withdraw'}
                    </span>
                  </td>
                  <td className="py-3 text-right text-sm text-white">
                    {item.type === 'deposit' ? '+' : '-'}
                    {item.amount} {item.symbol}
                  </td>
                  <td className="py-3 text-right text-xs text-dark-400">
                    {formatTime(item.ts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
