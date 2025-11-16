'use client';

import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance, useEnsName } from 'wagmi';
import { Wallet, Copy, ExternalLink, TrendingUp, DollarSign, Activity } from 'lucide-react';
import { formatETH, formatUSD } from '@/utils/format';
import { useState } from 'react';

export default function WalletPage() {
  const { address, isConnected, chain } = useAccount();
  const { data: balance } = useBalance({
    address: address,
  });
  const { data: ensName } = useEnsName({ address });
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getExplorerUrl = () => {
    if (!chain || !address) return '';
    const explorer = chain.blockExplorers?.default?.url;
    return explorer ? `${explorer}/address/${address}` : '';
  };

  return (
    <DashboardLayout currentPath="/wallet">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="glass-card p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Wallet Dashboard
              </h1>
              <p className="text-dark-300 text-sm sm:text-base">
                Manage your connected wallet, view balances, and track your arbitrage positions.
              </p>
            </div>
            {!isConnected && (
              <div className="flex-shrink-0">
                <ConnectButton label="Connect Wallet" />
              </div>
            )}
          </div>
        </div>

        {!isConnected ? (
          <div className="glass-card p-8 sm:p-12 text-center">
            <Wallet className="w-16 h-16 mx-auto mb-4 text-dark-400" />
            <h2 className="text-xl font-bold text-white mb-2">No Wallet Connected</h2>
            <p className="text-dark-400 mb-6">Connect your wallet to view your dashboard and manage your positions.</p>
            <ConnectButton label="Connect Wallet" />
          </div>
        ) : (
          <>
            {/* Wallet Info Card */}
            <div className="glass-card p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white mb-2">Connected Wallet</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-dark-400">
                      {ensName || `${address?.slice(0, 6)}...${address?.slice(-4)}`}
                    </span>
                    <button
                      onClick={copyAddress}
                      className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition text-dark-300 hover:text-white"
                      aria-label="Copy address"
                    >
                      <Copy className={`w-4 h-4 ${copied ? 'text-green-400' : ''}`} />
                    </button>
                    {copied && <span className="text-xs text-green-400">Copied!</span>}
                    {getExplorerUrl() && (
                      <a
                        href={getExplorerUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition text-dark-300 hover:text-white"
                        aria-label="View on explorer"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-dark-400 mb-1">Network</div>
                  <div className="text-sm font-semibold text-white">{chain?.name || 'Unknown'}</div>
                </div>
              </div>

              {/* Balance */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs text-dark-400">Native Balance</span>
                  </div>
                  <div className="text-xl font-bold text-white">
                    {balance ? formatETH(parseFloat(balance.formatted)) : '0.00'} {chain?.nativeCurrency?.symbol || 'ETH'}
                  </div>
                  {balance && (
                    <div className="text-xs text-dark-400 mt-1">
                      ≈ {formatUSD(parseFloat(balance.formatted) * 3000)} {/* Rough estimate */}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-dark-400">Total PnL</span>
                  </div>
                  <div className="text-xl font-bold text-white">+0.00 ETH</div>
                  <div className="text-xs text-green-400 mt-1">$0.00</div>
                </div>

                <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-dark-400">Active Positions</span>
                  </div>
                  <div className="text-xl font-bold text-white">0</div>
                  <div className="text-xs text-dark-400 mt-1">No active trades</div>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="glass-card p-4 sm:p-6">
              <h3 className="text-lg font-bold text-white mb-4">Recent Activity</h3>
              <div className="text-center py-8 text-dark-400">
                <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
                <p className="text-xs mt-1">Your arbitrage trades will appear here</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="glass-card p-4 sm:p-6">
              <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <button className="px-4 py-3 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-white transition-all duration-200 font-medium text-sm">
                  Fund Wallet
                </button>
                <button className="px-4 py-3 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-white transition-all duration-200 font-medium text-sm">
                  View Positions
                </button>
                <button className="px-4 py-3 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-white transition-all duration-200 font-medium text-sm">
                  Transaction History
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

