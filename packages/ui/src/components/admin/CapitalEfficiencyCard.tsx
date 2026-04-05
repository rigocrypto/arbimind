'use client';

import { PieChart, BarChart3 } from 'lucide-react';
import type { AdminTx, AdminWallets } from '@/lib/adminApi';

interface CapitalEfficiencyCardProps {
  wallets: AdminWallets | null;
  txs: AdminTx[];
}

function fmtEth(v: number) {
  return `${v.toFixed(4)} ETH`;
}

function fmtPct(v: number) {
  return `${v.toFixed(1)}%`;
}

export function CapitalEfficiencyCard({ wallets, txs }: CapitalEfficiencyCardProps) {
  const execEth = wallets?.wallets.execution.balanceEth ?? 0;
  const treasEth = wallets?.wallets.treasury.balanceEth ?? 0;
  const totalCapital = execEth + treasEth;

  const successTxs = txs.filter((t) => t.status === 'success');
  const avgTradeSize = successTxs.length > 0
    ? successTxs.reduce((sum, t) => sum + Math.abs(t.grossProfit + t.gasCost), 0) / successTxs.length
    : 0;

  const deployed = totalCapital > 0 ? Math.min(100, (avgTradeSize / totalCapital) * 100 * successTxs.length) : 0;
  const idle = 100 - deployed;

  const hasData = totalCapital > 0;

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-cyan-400" />
        Capital Efficiency
      </h3>

      {!hasData ? (
        <p className="text-sm text-dark-500">Wallet balances required to calculate capital efficiency.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-dark-400 uppercase tracking-wider mb-1">Total Capital</div>
            <div className="text-sm font-medium text-white">{fmtEth(totalCapital)}</div>
          </div>
          <div>
            <div className="text-xs text-dark-400 uppercase tracking-wider mb-1">Avg Trade Size</div>
            <div className="text-sm font-medium text-white">
              {avgTradeSize > 0 ? fmtEth(avgTradeSize) : '—'}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-dark-400 uppercase tracking-wider mb-1">
              <PieChart className="w-3 h-3" /> Utilization
            </div>
            <div className="text-sm font-medium text-cyan-400">{fmtPct(deployed)}</div>
          </div>
          <div>
            <div className="text-xs text-dark-400 uppercase tracking-wider mb-1">Idle Capital</div>
            <div className="text-sm font-medium text-dark-300">{fmtPct(idle)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
