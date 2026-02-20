'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import Link from 'next/link';
import { Wallet, ArrowRightLeft, ChevronLeft, Send, AlertTriangle } from 'lucide-react';
import { BaseWalletMultiButton } from '@solana/wallet-adapter-react-ui';
import toast from 'react-hot-toast';

import { API_BASE } from '@/lib/apiConfig';
import { ArbAccountCard, PerformanceCharts, ActivityTable } from '@/components/portfolio';
import { getPortfolioErrorDetails, usePortfolioSummary, usePortfolioTimeseries } from '@/hooks/usePortfolio';

const IS_MAINNET = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta';
const SOLSCAN_BASE = 'https://solscan.io';
const SOLSCAN_TX_SUFFIX = IS_MAINNET ? '' : '?cluster=devnet';
// Override only the states that display the CTA text so it never regresses to "Select Wallet".
const SOLANA_WALLET_BUTTON_LABELS = {
  'has-wallet': 'Connect Wallet',
  'no-wallet': 'Connect Wallet',
} as const;

export default function SolanaWalletPageClient() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction, wallets } = useWallet();
  const [loading, setLoading] = useState<string | null>(null);
  const address = publicKey?.toBase58();
  const {
    data: portfolio,
    isLoading: portfolioLoading,
    isError: portfolioError,
    error: portfolioQueryError,
    refetch: refetchPortfolio,
  } = usePortfolioSummary('solana', address);
  const { data: timeseries, isLoading: timeseriesLoading } = usePortfolioTimeseries('solana', address, '30d');
  const portfolioErrorDetails = getPortfolioErrorDetails(portfolioQueryError);

  // Transfer form state
  const [transferDestination, setTransferDestination] = useState<'arb' | 'external'>('arb');
  const [transferAmount, setTransferAmount] = useState('0.1');
  const [transferToPubkey, setTransferToPubkey] = useState('');

  // Swap form state
  const [swapSide, setSwapSide] = useState<'SOL_TO_USDC' | 'USDC_TO_SOL'>('SOL_TO_USDC');
  const [swapAmount, setSwapAmount] = useState('0.1');
  const [swapSlippageBps, setSwapSlippageBps] = useState(50);

  const handleTransfer = async () => {
    if (!connected || !publicKey) {
      toast.error('Connect wallet first');
      return;
    }
    const amount = parseFloat(transferAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (transferDestination === 'external') {
      const pk = transferToPubkey.trim();
      if (!pk || pk.length < 32) {
        toast.error('Enter a valid recipient address');
        return;
      }
    }
    setLoading('transfer');
    try {
      const res = await fetch(`${API_BASE}/solana/tx/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPubkey: publicKey.toBase58(),
          destination: transferDestination,
          toPubkey: transferDestination === 'external' ? transferToPubkey.trim() : undefined,
          amountSol: amount,
        }),
      });

      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(errBody.error || 'Transfer build failed');
        return;
      }

      const data = errBody as {
        transactionBase64: string;
        recentBlockhash: string;
        lastValidBlockHeight: number;
        feeLamports: number;
      };

      const txBytes = Uint8Array.from(atob(data.transactionBase64), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);

      const sig = await sendTransaction(tx, connection, { preflightCommitment: 'confirmed' });

      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: data.recentBlockhash,
          lastValidBlockHeight: data.lastValidBlockHeight,
        },
        'confirmed'
      );

      toast.success(`Confirmed: ${sig.slice(0, 8)}...${sig.slice(-8)}`);
      setTransferAmount('0.1');
      setTransferToPubkey('');
    } catch (err: unknown) {
      const msg = String(err instanceof Error ? err.message : err ?? 'Transfer failed');
      if (msg.includes('disconnected port') || msg.includes('[PHANTOM]')) {
        toast('Phantom connection lost. Open Phantom to unlock, then refresh and try again.', { icon: '🔌' });
        return;
      }
      toast.error(msg || 'Transfer failed');
    } finally {
      setLoading(null);
    }
  };

  const handleSwap = async () => {
    if (!connected || !publicKey) {
      toast.error('Connect wallet first');
      return;
    }
    const amount = parseFloat(swapAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!IS_MAINNET) {
      toast.error('Swaps are mainnet-only. Set NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta');
      return;
    }
    setLoading('swap');
    try {
      const res = await fetch(`${API_BASE}/solana/jupiter/swap-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPubkey: publicKey.toBase58(),
          side: swapSide,
          amount,
          slippageBps: swapSlippageBps,
        }),
      });
      const errBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(errBody.error || 'Swap build failed');
        return;
      }
      const data = errBody as {
        transactionBase64: string;
        recentBlockhash: string;
        lastValidBlockHeight: number;
        quote?: { outAmount: string };
      };
      const txBytes = Uint8Array.from(atob(data.transactionBase64), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);
      const sig = await sendTransaction(tx, connection, { preflightCommitment: 'confirmed' });
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: data.recentBlockhash,
          lastValidBlockHeight: data.lastValidBlockHeight,
        },
        'confirmed'
      );
      toast.success(`Swap confirmed: ${sig.slice(0, 8)}...${sig.slice(-8)}`);
      setSwapAmount('0.1');
    } catch (err: unknown) {
      const msg = String(err instanceof Error ? err.message : err ?? 'Swap failed');
      if (msg.includes('disconnected port') || msg.includes('[PHANTOM]')) {
        toast('Phantom connection lost. Open Phantom to unlock, then refresh and try again.', { icon: '🔌' });
        return;
      }
      toast.error(msg || 'Swap failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <DashboardLayout currentPath="/solana-wallet">
      <div data-testid="solana-wallet-client" className="space-y-4 sm:space-y-6 pb-24">
        {/* Chain switcher */}
        <div className="flex items-center gap-2">
          <Link
            href="/wallet"
            className="flex items-center gap-1.5 text-sm text-dark-400 hover:text-white transition"
          >
            <ChevronLeft className="w-4 h-4" />
            EVM Wallet
          </Link>
          <span className="text-dark-600">|</span>
          <span className="text-sm font-medium text-cyan-400">Solana</span>
        </div>

        {/* Hero Section with Solana Logo and Parallax */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-visible rounded-2xl bg-gradient-to-br from-[#191a2a] via-[#1a1b2e] to-[#23244a] shadow-xl px-6 py-10 sm:py-14 sm:px-12 mb-4"
        >
          {/* Parallax background shapes */}
          <div className="absolute inset-0 pointer-events-none select-none">
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-gradient-to-br from-purple-500/30 to-cyan-400/20 rounded-full blur-2xl opacity-60 animate-pulse" />
            <div className="absolute -bottom-12 -right-12 w-56 h-56 bg-gradient-to-br from-pink-500/20 to-purple-400/10 rounded-full blur-2xl opacity-50 animate-pulse" />
          </div>
          <div className="relative z-10 flex flex-col lg:flex-row items-center gap-6 lg:gap-12">
            <div className="flex flex-col items-center lg:items-start gap-3 flex-1">
              <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent mb-1 text-center lg:text-left">
                Solana Arbitrage Wallet
              </h1>
              <p className="text-dark-200 text-base sm:text-lg max-w-md text-center lg:text-left">
                Premium Solana experience. Connect Phantom or Solflare to swap, transfer, and track your portfolio. Powered by ArbiMind.
              </p>
              <div className="flex flex-wrap gap-2 mt-2 justify-center lg:justify-start">
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-600/80 to-pink-500/80 text-xs font-semibold text-white shadow-sm">
                  <Wallet className="w-4 h-4" /> Wallet Connect
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-cyan-500/80 to-blue-400/80 text-xs font-semibold text-white shadow-sm">
                  <ArrowRightLeft className="w-4 h-4" /> Instant Swaps
                </span>
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-green-400/80 to-cyan-400/80 text-xs font-semibold text-white shadow-sm">
                  <Send className="w-4 h-4" /> Fast Transfers
                </span>
              </div>
              <BaseWalletMultiButton
                className="mt-4 !bg-gradient-to-r !from-cyan-500 !via-purple-500 !to-pink-500 !text-white !font-semibold !px-6 !py-2.5 !rounded-xl !shadow-lg !border-none !hover:from-cyan-400 !hover:to-purple-500"
                labels={SOLANA_WALLET_BUTTON_LABELS}
              />
            </div>
            <div className="flex flex-1 items-center justify-center min-h-[160px]">
              <Image
                src="/solana/solana-logo.svg"
                alt="Solana Logo"
                width={200}
                height={200}
                className="rounded-full shadow-2xl border-2 border-purple-500/40 object-contain"
                priority
                unoptimized
              />
              {/* Show connected state next to the hero art once a wallet is linked */}
              {connected && address && (
                <div className="rounded-xl bg-dark-900/80 border border-cyan-500/30 px-6 py-4 flex flex-col items-center gap-2 shadow-md mt-4">
                  <span className="text-xs text-dark-400">Connected as</span>
                  <span className="font-mono text-cyan-300 text-sm break-all">{address}</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {!connected ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-card p-8 sm:p-12 text-center overflow-visible mt-6"
          >
            <Wallet className="w-16 h-16 mx-auto mb-4 text-dark-400" />
            <h2 className="text-xl font-bold text-white mb-2">Ready to Experience Solana Like Never Before?</h2>
            <p className="text-dark-400 mb-6 text-lg font-medium">
              🚀 Dive into lightning-fast swaps, instant transfers, and real-time portfolio analytics. Connect your wallet and be among the first to try the next-gen Solana trading experience—now live on ArbiMind!
            </p>
            {wallets.length === 0 && (
              <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div>
                    <p className="font-medium">No Solana wallet detected.</p>
                    <p className="text-amber-200/80">
                      Enable your wallet extension in this browser profile (including Incognito if used), then reload this page.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {/* Connect using the hero button above */}
          </motion.div>
        ) : (
          <>
            {/* Arbitrage Account Portfolio */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <ArbAccountCard
                summary={portfolio ?? undefined}
                isLoading={portfolioLoading}
                isError={portfolioError}
                errorDetails={portfolioErrorDetails}
                onRefresh={() => refetchPortfolio()}
              />
            </motion.div>

            {/* Performance Charts */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <PerformanceCharts points={timeseries?.points ?? []} method={timeseries?.method} isLoading={timeseriesLoading} />
            </motion.div>

            {/* Recent Arb Activity */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <ActivityTable
                deposits={portfolio?.deposits ?? []}
                withdrawals={portfolio?.withdrawals ?? []}
                explorerBaseUrl={SOLSCAN_BASE}
                explorerTxSuffix={SOLSCAN_TX_SUFFIX}
                isLoading={portfolioLoading}
              />
            </motion.div>

            {/* Transfer SOL (real tx) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4 sm:p-6"
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Send className="w-5 h-5 text-cyan-400" />
                Transfer SOL
              </h2>
              <div className="space-y-4">
                <fieldset className="space-y-4">
                  <legend className="block text-sm font-medium text-dark-300 mb-2">Destination</legend>
                  <div className="flex gap-3">
                    <label htmlFor="sol-dest-arb" className="flex items-center gap-2 cursor-pointer">
                      <input
                        id="sol-dest-arb"
                        type="radio"
                        name="destination"
                        value="arb"
                        checked={transferDestination === 'arb'}
                        onChange={() => setTransferDestination('arb')}
                        className="accent-cyan-500"
                        aria-label="Arb account"
                      />
                      <span className="text-white">Arb account</span>
                    </label>
                    <label htmlFor="sol-dest-external" className="flex items-center gap-2 cursor-pointer">
                      <input
                        id="sol-dest-external"
                        type="radio"
                        name="destination"
                        value="external"
                        checked={transferDestination === 'external'}
                        onChange={() => setTransferDestination('external')}
                        className="accent-cyan-500"
                        aria-label="External address"
                      />
                      <span className="text-white">External address</span>
                    </label>
                  </div>
                </fieldset>
                {transferDestination === 'external' && (
                  <div>
                    <label htmlFor="sol-recipient" className="block text-sm font-medium text-dark-300 mb-2">Recipient (base58)</label>
                    <input
                      id="sol-recipient"
                      name="recipient"
                      type="text"
                      value={transferToPubkey}
                      onChange={(e) => setTransferToPubkey(e.target.value)}
                      placeholder="e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
                      className="w-full px-4 py-2.5 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm font-mono placeholder-dark-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="sol-amount" className="block text-sm font-medium text-dark-300 mb-2">Amount (SOL)</label>
                  <input
                    id="sol-amount"
                    name="amountSol"
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                  {(() => {
                    const amt = parseFloat(transferAmount);
                    const estFee = Number.isFinite(amt) && amt > 0
                      ? Math.max(0.001, amt * 0.005).toFixed(4)
                      : '0.001';
                    const total = Number.isFinite(amt) && amt > 0 ? (amt + parseFloat(estFee)).toFixed(4) : '—';
                    return (
                      <p className="text-xs text-dark-400 mt-1.5">
                        You will send: {amt > 0 ? amt.toFixed(4) : '—'} SOL + fee: ~{estFee} SOL ≈ {total} SOL total
                      </p>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  onClick={handleTransfer}
                  disabled={!!loading}
                  className="w-full xs:w-auto px-4 py-3 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-400 font-medium hover:from-cyan-500/30 hover:to-purple-500/30 transition disabled:opacity-50"
                >
                  {loading === 'transfer' ? 'Sending…' : 'Transfer (0.5% fee)'}
                </button>
                <p className="text-xs text-dark-500">
                  Non-custodial. You sign with your wallet. Fee goes to protocol.
                </p>
              </div>
            </motion.div>

            {/* Swap SOL ↔ USDC (Jupiter, mainnet-only) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4 sm:p-6"
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-purple-400" />
                Swap SOL ↔ USDC
              </h2>
              {!IS_MAINNET && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm mb-4">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Swaps are mainnet-only. Set cluster to mainnet-beta.
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label htmlFor="swap-side" className="block text-sm font-medium text-dark-300 mb-2">Direction</label>
                  <select
                    id="swap-side"
                    name="swapSide"
                    value={swapSide}
                    onChange={(e) => setSwapSide(e.target.value as 'SOL_TO_USDC' | 'USDC_TO_SOL')}
                    className="w-full px-4 py-2.5 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="SOL_TO_USDC">SOL → USDC</option>
                    <option value="USDC_TO_SOL">USDC → SOL</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="swap-amount" className="block text-sm font-medium text-dark-300 mb-2">
                    Amount ({swapSide === 'SOL_TO_USDC' ? 'SOL' : 'USDC'})
                  </label>
                  <input
                    id="swap-amount"
                    name="swapAmount"
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label htmlFor="swap-slippage" className="block text-sm font-medium text-dark-300 mb-2">Slippage (bps)</label>
                  <input
                    id="swap-slippage"
                    name="slippageBps"
                    type="number"
                    min="1"
                    max="1000"
                    value={swapSlippageBps}
                    onChange={(e) => setSwapSlippageBps(Number(e.target.value) || 50)}
                    className="w-full px-4 py-2.5 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm focus:outline-none focus:border-purple-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSwap}
                  disabled={!!loading || !IS_MAINNET}
                  className="w-full xs:w-auto px-4 py-3 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-300 font-medium hover:from-purple-500/30 hover:to-pink-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading === 'swap' ? 'Swapping…' : 'Swap (sign)'}
                </button>
                <p className="text-xs text-dark-500">
                  Keep a small SOL balance for fees. Real mainnet SOL/USDC.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </div>

    </DashboardLayout>
  );
}
