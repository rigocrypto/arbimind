'use client';

import { TrendingUp, Clock, Zap } from 'lucide-react';
import type { AdminTx } from '@/lib/adminApi';

interface PnlDeltaRowProps {
  txs: AdminTx[];
}

function fmtEth(v: number) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(4)} ETH`;
}

export function PnlDeltaRow({ txs }: PnlDeltaRowProps) {
  const now = Date.now();
  const oneHourAgo = now - 3600_000;
  const twentyFourHoursAgo = now - 86400_000;

  const successTxs = txs.filter((t) => t.status === 'success');
  const lastTrade = successTxs[0];
  const lastTradePnl = lastTrade?.netProfit ?? 0;

  const last1hPnl = successTxs
    .filter((t) => t.time >= oneHourAgo)
    .reduce((sum, t) => sum + t.netProfit, 0);

  const last24hTxs = successTxs.filter((t) => t.time >= twentyFourHoursAgo);
  const last24hPnl = last24hTxs.reduce((sum, t) => sum + t.netProfit, 0);
  const hoursActive = Math.max(1, (now - twentyFourHoursAgo) / 3600_000);
  const pnlVelocity = last24hPnl / hoursActive;

  const cards = [
    {
      label: 'Last Trade PnL',
      value: lastTrade ? fmtEth(lastTradePnl) : '—',
      icon: TrendingUp,
      positive: lastTradePnl >= 0,
    },
    {
      label: 'Last 1h PnL',
      value: fmtEth(last1hPnl),
      icon: Clock,
      positive: last1hPnl >= 0,
    },
    {
      label: 'PnL Velocity (24h)',
      value: `${fmtEth(pnlVelocity)}/hr`,
      icon: Zap,
      positive: pnlVelocity >= 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cards.map(({ label, value, icon: Icon, positive }) => (
        <div key={label} className="card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-4 h-4 ${positive ? 'text-green-400' : 'text-red-400'}`} />
            <span className="text-xs text-dark-400 uppercase tracking-wider">{label}</span>
          </div>
          <div className={`text-lg font-bold ${positive ? 'text-green-400' : 'text-red-400'}`}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
