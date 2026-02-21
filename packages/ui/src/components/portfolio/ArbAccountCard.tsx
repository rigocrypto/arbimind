'use client';

import { Copy, RefreshCw, Wallet } from 'lucide-react';
import { formatAddress, formatUSD } from '@/utils/format';
import type { PortfolioSummary } from '@/hooks/usePortfolio';
import type { PortfolioErrorDetails } from '@/hooks/usePortfolio';
import { HelpTooltip } from '@/components/HelpTooltip';
import toast from 'react-hot-toast';

const PNL_TOOLTIP = 'MVP estimate: based on current arb account balance vs total deposits. Does not include external positions, fees, or realized vs unrealized breakdown.';
const SOL_EQUIV_DECIMALS = 4;

interface ArbAccountCardProps {
  summary: PortfolioSummary | undefined;
  isLoading: boolean;
  isError?: boolean;
  errorDetails?: PortfolioErrorDetails | null;
  onRefresh?: () => void;
  arbAddressDisplay?: string;
}

export function ArbAccountCard({
  summary,
  isLoading,
  isError,
  errorDetails,
  onRefresh,
  arbAddressDisplay,
}: ArbAccountCardProps) {
  const arbAddr = arbAddressDisplay ?? summary?.arbAddress ?? '';
  const totalDeposited = summary?.totals.depositedUsd ?? 0;
  const totalWithdrawn = summary?.totals.withdrawnUsd ?? 0;
  const feesUsd = summary?.totals.feesUsd ?? 0;
  const pnlUsd = summary?.totals.pnlUsd ?? 0;
  const roiPct = summary?.totals.roiPct;
  const balances = summary?.balances ?? [];
  const updatedAt = summary?.updatedAt;
  const solBalance = balances.find((balance) => balance.symbol.toUpperCase() === 'SOL');
  const solAmount = solBalance ? Number(solBalance.amount.replace(/,/g, '')) : NaN;
  const solUsd = solBalance?.usd;
  const solUsdPrice = Number.isFinite(solAmount) && solAmount > 0 && typeof solUsd === 'number' && solUsd > 0
    ? solUsd / solAmount
    : null;
  const depositedSolEquivalent =
    solUsdPrice && solUsdPrice > 0 ? totalDeposited / solUsdPrice : null;
  const withdrawnSolEquivalent =
    solUsdPrice && solUsdPrice > 0 ? totalWithdrawn / solUsdPrice : null;

  const copyAddress = () => {
    if (arbAddr) {
      navigator.clipboard.writeText(arbAddr);
      toast.success('Arb address copied');
    }
  };

  if (isError) {
    return (
      <div className="glass-card p-4 sm:p-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
          <Wallet className="w-5 h-5 text-cyan-400" />
          Arbitrage Account
        </h2>
        <p className="text-dark-400 text-sm">{errorDetails?.message || 'Portfolio data unavailable.'}</p>
        {errorDetails?.reason && (
          <p className="mt-2 text-xs text-amber-300">Reason: {errorDetails.reason}</p>
        )}
        {errorDetails?.fix && (
          <p className="mt-1 text-xs text-cyan-300">Fix: {errorDetails.fix}</p>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={errorDetails?.isConfigIssue}
            className="mt-3 px-3 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-sm transition"
          >
            {errorDetails?.isConfigIssue ? 'Retry disabled until backend config is fixed' : 'Retry'}
          </button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="glass-card p-4 sm:p-6 animate-pulse">
        <div className="h-6 w-48 bg-dark-700 rounded mb-4" />
        <div className="h-4 w-32 bg-dark-700 rounded mb-2" />
        <div className="h-4 w-24 bg-dark-700 rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-dark-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Wallet className="w-5 h-5 text-cyan-400" />
          Arbitrage Account
        </h2>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white transition"
            aria-label="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {arbAddr && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-mono text-dark-300">{formatAddress(arbAddr, 8, 8)}</span>
          <button
            type="button"
            onClick={copyAddress}
            className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition text-dark-300 hover:text-white"
            aria-label="Copy arb address"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-dark-800/50 border border-dark-700">
          <div className="text-xs text-dark-400">Deposited</div>
          <div className="text-sm font-bold text-white">
            {formatUSD(totalDeposited)}
            {depositedSolEquivalent !== null && (
              <span className="text-dark-300"> · {depositedSolEquivalent.toFixed(SOL_EQUIV_DECIMALS)} SOL</span>
            )}
          </div>
          <div className="text-[10px] text-dark-500 mt-0.5">Est. (static price)</div>
        </div>
        <div className="p-3 rounded-lg bg-dark-800/50 border border-dark-700">
          <div className="text-xs text-dark-400">Withdrawn</div>
          <div className="text-sm font-bold text-white">
            {formatUSD(totalWithdrawn)}
            {withdrawnSolEquivalent !== null && (
              <span className="text-dark-300"> · {withdrawnSolEquivalent.toFixed(SOL_EQUIV_DECIMALS)} SOL</span>
            )}
          </div>
          <div className="text-[10px] text-dark-500 mt-0.5">Est. (static price)</div>
        </div>
        <div className="p-3 rounded-lg bg-dark-800/50 border border-dark-700">
          <div className="text-xs text-dark-400 flex items-center gap-1">
            P&L
            <HelpTooltip content={PNL_TOOLTIP} />
          </div>
          <div
            className={`text-sm font-bold ${
              pnlUsd >= 0 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {pnlUsd >= 0 ? '+' : ''}{formatUSD(pnlUsd)}
          </div>
          <div className="text-[10px] text-dark-500 mt-0.5">Est. (static price)</div>
        </div>
        <div className="p-3 rounded-lg bg-dark-800/50 border border-dark-700">
          <div className="text-xs text-dark-400 flex items-center gap-1">
            ROI
            <HelpTooltip content={PNL_TOOLTIP} />
          </div>
          <div
            className={`text-sm font-bold ${
              roiPct !== undefined
                ? roiPct >= 0
                  ? 'text-green-400'
                  : 'text-red-400'
                : 'text-dark-400'
            }`}
          >
            {roiPct !== undefined ? `${roiPct >= 0 ? '+' : ''}${roiPct.toFixed(2)}%` : '—'}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-dark-400">Current arb value (by token)</div>
        <div className="flex flex-wrap gap-2">
          {balances.length === 0 ? (
            <span className="text-sm text-dark-500">—</span>
          ) : (
            balances.map((b) => (
              <div
                key={b.symbol}
                className="px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-600 text-sm"
              >
                <span className="text-white font-medium">{b.amount}</span>{' '}
                <span className="text-dark-400">{b.symbol}</span>
                {b.usd !== undefined && (
                  <span className="text-dark-500 ml-1">≈ {formatUSD(b.usd)} <span className="text-dark-600">(est.)</span></span>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {feesUsd > 0 && (
        <p className="text-xs text-dark-500 mt-3">Fees paid: {formatUSD(feesUsd)}</p>
      )}

      {updatedAt && (
        <p className="text-xs text-dark-500 mt-2">
          Last updated: {new Date(updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
