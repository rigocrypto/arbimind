'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Clock, Zap } from 'lucide-react';
import type { AdminTx } from '@/lib/adminApi';

interface PnlDeltaRowProps {
  txs: AdminTx[];
}

interface PnlMetrics {
  lastTradePnl: number;
  lastTrade: AdminTx | undefined;
  last1hPnl: number;
  pnlVelocity: number;
}

function computeMetrics(txs: AdminTx[]): PnlMetrics {
  const now = Date.now();
  const oneHourAgo = now - 3600_000;
  const twentyFourHoursAgo = now - 86400_000;

  const successTxs = txs.filter((t) => t.status === 'success');
  const lt = successTxs[0];

  const h1 = successTxs
    .filter((t) => t.time >= oneHourAgo)
    .reduce((sum, t) => sum + t.netProfit, 0);

  const last24hTxs = successTxs.filter((t) => t.time >= twentyFourHoursAgo);
  const last24hPnl = last24hTxs.reduce((sum, t) => sum + t.netProfit, 0);
  const hoursActive = Math.max(1, (now - twentyFourHoursAgo) / 3600_000);

  return {
    lastTrade: lt,
    lastTradePnl: lt?.netProfit ?? 0,
    last1hPnl: h1,
    pnlVelocity: last24hPnl / hoursActive,
  };
}

function fmtEth(v: number) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(4)} ETH`;
}

export function PnlDeltaRow({ txs }: PnlDeltaRowProps) {
  const [metrics, setMetrics] = useState<PnlMetrics>(() => computeMetrics(txs));

  useEffect(() => {
    setMetrics(computeMetrics(txs));
  }, [txs]);

  const { lastTradePnl, lastTrade, last1hPnl, pnlVelocity } = metrics;

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
