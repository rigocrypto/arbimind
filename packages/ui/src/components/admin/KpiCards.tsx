'use client';

import { TrendingUp, DollarSign, Flame, Target, XCircle } from 'lucide-react';

interface KpiCardsProps {
  netProfit: number;
  grossProfit: number;
  gasSpend: number;
  winRate: number;
  failedTxCount: number;
  txCount: number;
}

function fmtEth(v: number) {
  return `${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(4)} ETH`;
}

export function KpiCards({
  netProfit,
  grossProfit,
  gasSpend,
  winRate,
  failedTxCount,
  txCount,
}: KpiCardsProps) {
  const cards = [
    { label: '24h Net Profit', value: fmtEth(netProfit), icon: TrendingUp, positive: netProfit >= 0 },
    { label: 'Gross Profit', value: fmtEth(grossProfit), icon: DollarSign, positive: true },
    { label: 'Gas Spend', value: fmtEth(gasSpend), icon: Flame, positive: false },
    { label: 'Win Rate', value: `${winRate.toFixed(1)}%`, icon: Target, positive: winRate >= 70 },
    { label: 'Failed Tx', value: String(failedTxCount), icon: XCircle, positive: failedTxCount === 0 },
    { label: 'Tx Count', value: String(txCount), icon: Target, positive: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(({ label, value, icon: Icon, positive }) => (
        <div key={label} className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-4 h-4 ${positive ? 'text-green-400' : 'text-dark-400'}`} />
            <span className="text-xs text-dark-400 uppercase tracking-wider">{label}</span>
          </div>
          <div className={`text-lg font-bold ${positive ? 'text-green-400' : 'text-dark-300'}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}
