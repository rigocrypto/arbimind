
'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { useAccount, useBalance, useEnsName } from 'wagmi';
import {
  Wallet,
  Copy,
  ExternalLink,
  TrendingUp,
  DollarSign,
  Activity,
  AlertTriangle,
  ChevronRight,
  Shield,
  Banknote,
} from 'lucide-react';
import { formatETH, formatUSD, formatAddress, formatTxHash } from '@/utils/format';
import { HelpTooltip } from '@/components/HelpTooltip';
import { ChainSwitcherModal } from '@/components/ChainSwitcherModal';
import { ArbAccountCard, PerformanceCharts, ActivityTable } from '@/components/portfolio';
import { usePortfolioSummary, usePortfolioTimeseries } from '@/hooks/usePortfolio';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Image from 'next/image';

const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
};

const MIN_ETH = parseFloat(process.env.NEXT_PUBLIC_MIN_TRADE_ETH || '0.05');
const MIN_USDC = parseFloat(process.env.NEXT_PUBLIC_MIN_TRADE_USDC || '125');

// Mock tx history – replace with /api/wallet/txs or viem when wired
interface TxRow {
  hash: string;
  type: 'arb' | 'swap' | 'withdraw' | 'deposit';
  profitLoss: number;
  gasEth: number;
  status: 'success' | 'pending' | 'failed';
  timestamp: number;
}

const MOCK_TXS: TxRow[] = [
  { hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd', type: 'arb', profitLoss: 0.0123, gasEth: 0.0012, status: 'success', timestamp: Date.now() - 3600000 },
  { hash: '0x5678901234abcdef5678901234abcdef5678901234abcdef5678901234abcd', type: 'swap', profitLoss: -0.0005, gasEth: 0.0008, status: 'success', timestamp: Date.now() - 7200000 },
  { hash: '0x9abc5678901234abcdef5678901234abcdef5678901234abcdef5678901234', type: 'arb', profitLoss: 0.0089, gasEth: 0.001, status: 'success', timestamp: Date.now() - 86400000 },
];

function WithdrawModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-[9999] w-full max-w-sm rounded-xl bg-dark-800 border border-dark-600 p-6 shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-6 h-6 text-amber-400" />
          <h3 className="text-lg font-bold text-white">Withdraw</h3>
        </div>
        <p className="text-sm text-dark-300 mb-6">
          Profits auto-sweep to the treasury. Withdrawals require multisig approval. Contact admin for manual withdrawals.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 font-medium transition"
        >
          OK
        </button>
      </motion.div>
    </div>
  );
}

export default function WalletPage() {
  const { address, isConnected, chain, chainId } = useAccount();
  const { data: ethBalance } = useBalance({ address });
  const usdcToken = address && chainId ? USDC_BY_CHAIN[chainId] : null;
  const { data: usdcBalance } = useBalance({
    address: address ?? undefined,
    token: usdcToken ?? undefined,
  });
  const { data: ensName } = useEnsName({ address });
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [chainSwitcherOpen, setChainSwitcherOpen] = useState(false);
  const [txFilter, setTxFilter] = useState<string>('all');

  const ethVal = ethBalance ? parseFloat(ethBalance.formatted) : 0;
  const usdcVal = usdcBalance ? Number(usdcBalance.formatted) / 1e6 : 0;
  const isLowBalance = ethVal < MIN_ETH && usdcVal < MIN_USDC;
  const explorerUrl = chain?.blockExplorers?.default?.url ?? '';
  const { data: portfolio, isLoading: portfolioLoading, isError: portfolioError, refetch: refetchPortfolio } = usePortfolioSummary('evm', address ?? undefined);
  const { data: timeseries, isLoading: timeseriesLoading } = usePortfolioTimeseries('evm', address ?? undefined, '30d');

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success('Address copied');
    }
  };

  const filteredTxs = useMemo(() => {
    if (txFilter === 'all') return MOCK_TXS;
    return MOCK_TXS.filter((t) => t.type === txFilter);
  }, [txFilter]);

  const getTxTypeLabel = (type: TxRow['type']) =>
    ({ arb: 'Arbitrage', swap: 'Swap', withdraw: 'Withdraw', deposit: 'Deposit' }[type]);
  const getStatusColor = (status: TxRow['status']) =>
    ({ success: 'text-green-400', pending: 'text-amber-400', failed: 'text-red-400' }[status]);

  return (
    <DashboardLayout currentPath="/wallet">
      <div className="space-y-4 sm:space-y-6 pb-24">
        {/* Chain switcher */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-cyan-400">EVM</span>
          <span className="text-dark-600">|</span>
          <Link
            href="/solana-wallet"
            className="text-sm text-dark-400 hover:text-purple-400 transition"
          >
            Solana →
          </Link>
        </div>
        {/* Hero section with animated background and feature cards */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-visible rounded-2xl bg-gradient-to-br from-[#191a2a] via-[#1a1b2e] to-[#23244a] shadow-xl px-6 py-10 sm:py-14 sm:px-12 mb-4"
        >
          {/* Animated blobs */}
          <div className="absolute inset-0 pointer-events-none select-none z-0">
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-gradient-to-br from-cyan-400/30 to-purple-400/20 rounded-full blur-2xl opacity-60 animate-pulse" />
            <div className="absolute -bottom-12 -right-12 w-56 h-56 bg-gradient-to-br from-pink-500/20 to-purple-400/10 rounded-full blur-2xl opacity-50 animate-pulse" />
          </div>
          <div className="relative z-10 flex flex-col lg:flex-row items-center gap-6 lg:gap-12">
            <div className="flex flex-col items-center lg:items-start gap-3 flex-1">
              <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-1 text-center lg:text-left">
                EVM Wallet Dashboard
              </h1>
              <p className="text-dark-200 text-base sm:text-lg max-w-md text-center lg:text-left">
                Manage your connected wallet, view balances, and track arbitrage activity.
              </p>
              {/* Feature cards */}
              <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                {[{
                  icon: <Banknote className="w-6 h-6 text-cyan-400" />, title: 'Multi-chain ready', desc: 'Switch between Ethereum, Arbitrum, Optimism, and Base instantly.'
                }, {
                  icon: <TrendingUp className="w-6 h-6 text-purple-400" />, title: 'Fast execution', desc: 'Lightning-fast arbitrage and swaps with optimized routing.'
                }, {
                  icon: <DollarSign className="w-6 h-6 text-green-400" />, title: 'Fee-aware routing', desc: 'Smart fee detection for best net returns.'
                }].map((card) => (
                  <motion.div
                    key={card.title}
                    whileHover={{ scale: 1.06, y: -6, boxShadow: '0 8px 32px 0 rgba(80,200,255,0.18)' }}
                    whileTap={{ scale: 0.98 }}
                    tabIndex={0}
                    className="p-5 rounded-xl bg-dark-800/60 border border-dark-700 shadow-lg transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    style={{ perspective: 600 }}
                    onMouseMove={e => {
                      const card = e.currentTarget;
                      const rect = card.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      const centerX = rect.width / 2;
                      const centerY = rect.height / 2;
                      const rotateX = ((y - centerY) / centerY) * 8;
                      const rotateY = ((x - centerX) / centerX) * -8;
                      card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.06)`;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.transform = '';
                    }}
                    onFocus={e => {
                      e.currentTarget.style.boxShadow = '0 8px 32px 0 rgba(80,200,255,0.18)';
                    }}
                    onBlur={e => {
                      e.currentTarget.style.boxShadow = '';
                    }}
                  >
                    <div className="flex items-center gap-3 mb-2">{card.icon}<span className="text-lg font-bold text-white">{card.title}</span></div>
                    <div className="text-sm text-dark-300">{card.desc}</div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center min-h-[160px]">
              <Image
                src="/evm/ethereum-logo.svg"
                alt="Ethereum Logo"
                width={160}
                height={160}
                className="rounded-full shadow-2xl border-2 border-cyan-400/40 object-contain"
                priority
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 mt-8 justify-center">
            {!isConnected ? (
                <></>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setChainSwitcherOpen(true)}
                  className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500/80 to-purple-500/80 text-white font-semibold shadow-md hover:from-cyan-500 hover:to-purple-500 transition"
                >
                  Switch Network
                </button>
                {explorerUrl && address && (
                  <a
                    href={`${explorerUrl}/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-500/80 to-pink-500/80 text-white font-semibold shadow-md hover:from-purple-500 hover:to-pink-500 transition"
                  >
                    View on Explorer
                  </a>
                )}
              </>
            )}
          </div>
          <div className="mt-4 text-xs text-dark-400 text-center">
            Solana is available via network switching. <Link href="/solana-wallet" className="text-purple-400 underline hover:text-cyan-400">Try Solana Wallet</Link>
          </div>
        </motion.div>

        {!isConnected ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card p-8 sm:p-12 text-center"
          >
            <Wallet className="w-16 h-16 mx-auto mb-4 text-dark-400" />
            <h2 className="text-xl font-bold text-white mb-2">No Wallet Connected</h2>
            <p className="text-dark-400 mb-6">Connect your wallet to view balances and activity.</p>
          </motion.div>
        ) : (
          <>
            {/* Balances Card */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass-card p-4 sm:p-6"
            >
              <h2 className="text-lg font-bold text-white mb-4">Balances</h2>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-sm text-dark-400 font-mono">
                  {ensName || formatAddress(address ?? '')}
                </span>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition text-dark-300 hover:text-white"
                  aria-label="Copy"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {explorerUrl && address && (
                  <a
                    href={`${explorerUrl}/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 transition text-dark-300 hover:text-cyan-400"
                    aria-label="Explorer"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              {isLowBalance && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm mb-4">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Low balance? Deposit {MIN_ETH} ETH or ~${MIN_USDC} USDC to trade.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs text-dark-400">ETH</span>
                  </div>
                  <div className="text-xl font-bold text-white">{formatETH(ethVal)}</div>
                  <div className="text-xs text-dark-400 mt-1">≈ {formatUSD(ethVal * 3000)}</div>
                </div>
                <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Banknote className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-dark-400">USDC</span>
                  </div>
                  <div className="text-xl font-bold text-white">{usdcVal.toFixed(2)}</div>
                  <div className="text-xs text-dark-400 mt-1">≈ {formatUSD(usdcVal)}</div>
                </div>
                <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-dark-400">Total PnL</span>
                  </div>
                  <div className="text-xl font-bold text-white">+0.00 ETH</div>
                  <div className="text-xs text-dark-400 mt-1">$0.00</div>
                </div>
              </div>
            </motion.div>

            {/* Arbitrage Account Portfolio */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
            >
              <ArbAccountCard
                summary={portfolio ?? undefined}
                isLoading={portfolioLoading}
                isError={portfolioError}
                onRefresh={() => refetchPortfolio()}
              />
            </motion.div>

            {/* Performance Charts */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              <PerformanceCharts points={timeseries?.points ?? []} method={timeseries?.method} isLoading={timeseriesLoading} />
            </motion.div>

            {/* Recent Arb Activity */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.09 }}
            >
              <ActivityTable
                deposits={portfolio?.deposits ?? []}
                withdrawals={portfolio?.withdrawals ?? []}
                explorerBaseUrl={explorerUrl}
                isLoading={portfolioLoading}
              />
            </motion.div>

            {/* Recent Activity */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card p-4 sm:p-6 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  Recent Activity
                  <HelpTooltip content="Last 10 txs. Profits auto-sweep to treasury." />
                </h3>
                <select
                  id="wallet-tx-filter"
                  name="txFilter"
                  value={txFilter}
                  onChange={(e) => setTxFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-600 text-sm text-white"
                >
                  <option value="all">All</option>
                  <option value="arb">Arb</option>
                  <option value="swap">Swap</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-dark-600">
                      <th className="text-left py-2 text-xs font-medium text-dark-400 uppercase">Tx</th>
                      <th className="text-left py-2 text-xs font-medium text-dark-400 uppercase">Type</th>
                      <th className="text-right py-2 text-xs font-medium text-dark-400 uppercase">P/L</th>
                      <th className="text-right py-2 text-xs font-medium text-dark-400 uppercase">Gas</th>
                      <th className="text-right py-2 text-xs font-medium text-dark-400 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-dark-400">
                          <Activity className="w-10 h-10 mx-auto mb-2 opacity-50" />
                          <p>No activity yet</p>
                        </td>
                      </tr>
                    ) : (
                      filteredTxs.map((tx) => (
                        <tr key={tx.hash} className="border-b border-dark-700/50 hover:bg-dark-800/30">
                          <td className="py-3">
                            <a
                              href={explorerUrl ? `${explorerUrl}/tx/${tx.hash}` : '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:underline font-mono text-sm"
                            >
                              {formatTxHash(tx.hash)}
                            </a>
                          </td>
                          <td className="py-3 text-sm text-dark-300">{getTxTypeLabel(tx.type)}</td>
                          <td className={`py-3 text-right font-medium text-sm ${tx.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {tx.profitLoss >= 0 ? '+' : ''}{formatETH(tx.profitLoss)} ETH
                          </td>
                          <td className="py-3 text-right text-sm text-dark-400">{formatETH(tx.gasEth)} ETH</td>
                          <td className={`py-3 text-right text-sm capitalize ${getStatusColor(tx.status)}`}>
                            {tx.status}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass-card p-4 sm:p-6"
            >
              <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setWithdrawOpen(true)}
                  className="flex items-center justify-between p-4 rounded-lg bg-dark-800/50 hover:bg-dark-700/50 border border-dark-600 transition group text-left"
                >
                  <div className="flex items-center gap-3">
                    <Banknote className="w-5 h-5 text-green-400" />
                    <span className="font-medium text-white">Withdraw</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-dark-400 group-hover:text-green-400" />
                </button>
                <a
                  href={explorerUrl && address ? `${explorerUrl}/address/${address}` : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 rounded-lg bg-dark-800/50 hover:bg-dark-700/50 border border-dark-600 transition group"
                >
                  <div className="flex items-center gap-3">
                    <ExternalLink className="w-5 h-5 text-purple-400" />
                    <span className="font-medium text-white">Tx Explorer</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-dark-400 group-hover:text-purple-400" />
                </a>
              </div>
            </motion.div>
          </>
        )}
      </div>

      <WithdrawModal isOpen={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
      <ChainSwitcherModal
        isOpen={chainSwitcherOpen}
        onClose={() => setChainSwitcherOpen(false)}
      />
    </DashboardLayout>
  );
}
