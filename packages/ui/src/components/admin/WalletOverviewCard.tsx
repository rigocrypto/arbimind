'use client';

import { Copy, Wallet, Shield } from 'lucide-react';

function shorten(addr: string) {
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return '—';
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function copyAddr(addr: string) {
  if (typeof navigator !== 'undefined') navigator.clipboard.writeText(addr);
}

interface WalletOverviewCardProps {
  execution: { address: string; balanceEth: number | null; balanceUsdc: number | null };
  treasury: { address: string; balanceEth: number | null; balanceUsdc: number | null };
  lastUpdated?: string;
}

export function WalletOverviewCard({ execution, treasury, lastUpdated }: WalletOverviewCardProps) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Wallet className="w-5 h-5 text-cyan-400" />
        Wallets
      </h3>
      <div className="space-y-4">
        <div>
          <div className="text-xs text-dark-400 uppercase tracking-wider mb-1">Execution (hot)</div>
          <div className="flex items-center gap-2">
            <code className="text-sm text-cyan-400 font-mono">{shorten(execution.address)}</code>
            <button
              type="button"
              onClick={() => copyAddr(execution.address)}
              className="p-1 rounded hover:bg-dark-600 transition-colors"
              aria-label="Copy"
            >
              <Copy className="w-4 h-4 text-dark-400" />
            </button>
          </div>
          <div className="text-xs text-dark-500 mt-1">
            ETH: {execution.balanceEth != null ? `${execution.balanceEth} ETH` : '—'} · USDC: {execution.balanceUsdc != null ? `${execution.balanceUsdc}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-dark-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Shield className="w-3 h-3" /> Treasury
          </div>
          <div className="flex items-center gap-2">
            <code className="text-sm text-cyan-400 font-mono">{shorten(treasury.address)}</code>
            <button
              type="button"
              onClick={() => copyAddr(treasury.address)}
              className="p-1 rounded hover:bg-dark-600 transition-colors"
              aria-label="Copy"
            >
              <Copy className="w-4 h-4 text-dark-400" />
            </button>
          </div>
          <div className="text-xs text-dark-500 mt-1">
            ETH: {treasury.balanceEth != null ? `${treasury.balanceEth} ETH` : '—'} · USDC: {treasury.balanceUsdc != null ? `${treasury.balanceUsdc}` : '—'}
          </div>
        </div>
      </div>
      {lastUpdated && (
        <div className="text-xs text-dark-500 mt-3 pt-3 border-t border-dark-600">Last updated: {lastUpdated}</div>
      )}
    </div>
  );
}
