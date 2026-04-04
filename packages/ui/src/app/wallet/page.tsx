
'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { useAccount, useBalance, useConnect, useDisconnect, useEnsName, useReadContract, useSendTransaction, useWriteContract } from 'wagmi';
import { formatUnits, parseEther, parseUnits, isAddress, erc20Abi, maxUint256 } from 'viem';
import {
  Wallet,
  Copy,
  ExternalLink,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  ChevronRight,
  Shield,
  Banknote,
  LogOut,
  Send,
  ArrowDownUp,
} from 'lucide-react';
import { formatETH, formatUSD, formatAddress } from '@/utils/format';
import { ChainSwitcherModal } from '@/components/ChainSwitcherModal';
import { TokenSelector } from '@/components/TokenSelector';
import { ArbAccountCard, PerformanceCharts, ActivityTable } from '@/components/portfolio';
import {
  type SwapToken,
  tokensForChain,
  tokenAddress,
  tokenKey,
  isSameToken,
  defaultPair,
  requiresApprovalReset,
} from '@/lib/evmSwapTokens';
import { getPortfolioErrorDetails, usePortfolioSummary, usePortfolioTimeseries } from '@/hooks/usePortfolio';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { notifyWalletStateUpdated, onCrossTabWalletChange } from '@/lib/walletState';
import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '@/lib/apiConfig';

const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,
  10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as const,
  137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as const,
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const,
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,
};

const MIN_ETH = parseFloat(process.env.NEXT_PUBLIC_MIN_TRADE_ETH || '0.05');
const MIN_USDC = parseFloat(process.env.NEXT_PUBLIC_MIN_TRADE_USDC || '20');

function isLikelyMobileBrowser() {
  if (typeof window === 'undefined') return false;
  return /android|iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isMetaMaskInAppBrowser() {
  if (typeof window === 'undefined') return false;
  return Boolean((window as Window & { ethereum?: { isMetaMask?: boolean } }).ethereum?.isMetaMask);
}

function buildMetaMaskDappLink(pathname: string) {
  if (typeof window === 'undefined') return pathname;
  const url = new URL(pathname, window.location.origin).toString();
  return `https://link.metamask.io/dapp/${encodeURIComponent(url)}`;
}

const SUPPORTED_CHAIN_IDS = new Set([1, 10, 42161, 8453, 137, 80002]);

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

function TransferModal({
  isOpen,
  onClose,
  ethBalance,
  usdcBalance,
  explorerUrl,
  chainId,
  onTransferComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  ethBalance: number;
  usdcBalance: number;
  explorerUrl: string;
  chainId: number | undefined;
  onTransferComplete?: () => void;
}) {
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState<'ETH' | 'USDC'>('ETH');
  const { sendTransactionAsync, isPending: isSendingEth } = useSendTransaction();
  const { writeContractAsync, isPending: isSendingUsdc } = useWriteContract();
  const { address: connectedAddress, chain: connectedChain } = useAccount();
  const [isSending, setIsSending] = useState(false);

  const usdcAddress = chainId ? USDC_BY_CHAIN[chainId] : undefined;
  const balance = token === 'ETH' ? ethBalance : usdcBalance;
  const isPending = isSendingEth || isSendingUsdc;

  const handleSend = useCallback(async () => {
    if (!isAddress(toAddress)) {
      toast.error('Invalid recipient address');
      return;
    }
    const val = parseFloat(amount);
    if (!Number.isFinite(val) || val <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (val > balance) {
      toast.error(`Insufficient ${token} balance`);
      return;
    }
    if (token === 'USDC' && !usdcAddress) {
      toast.error('USDC is not available on this network');
      return;
    }
    setIsSending(true);
    try {
      let hash: string;
      if (token === 'ETH') {
        hash = await sendTransactionAsync({ to: toAddress as `0x${string}`, value: parseEther(amount) });
      } else {
        hash = await writeContractAsync({
          address: usdcAddress!,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [toAddress as `0x${string}`, parseUnits(amount, 6)],
          account: connectedAddress,
          chain: connectedChain,
        });
      }
      toast.success(`Tx submitted: ${hash.slice(0, 10)}…${hash.slice(-8)}`);
      if (explorerUrl) {
        toast(() => (
          <a href={`${explorerUrl}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline text-cyan-400">
            View on Explorer
          </a>
        ));
      }
      setToAddress('');
      setAmount('');
      onTransferComplete?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Transfer failed');
      if (/user rejected|denied/i.test(msg)) {
        toast('Transaction cancelled', { icon: '🔒' });
      } else {
        toast.error(msg.length > 120 ? `${msg.slice(0, 120)}…` : msg);
      }
    } finally {
      setIsSending(false);
    }
  }, [toAddress, amount, balance, token, usdcAddress, sendTransactionAsync, writeContractAsync, explorerUrl, onTransferComplete, onClose, connectedAddress, connectedChain]);

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
          <Send className="w-6 h-6 text-cyan-400" />
          <h3 className="text-lg font-bold text-white">Send {token}</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label htmlFor="transfer-token" className="block text-xs text-dark-400 mb-1">Token</label>
            <select
              id="transfer-token"
              value={token}
              onChange={(e) => setToken(e.target.value as 'ETH' | 'USDC')}
              className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
            >
              <option value="ETH">ETH</option>
              {usdcAddress && <option value="USDC">USDC</option>}
            </select>
          </div>
          <div>
            <label htmlFor="transfer-to" className="block text-xs text-dark-400 mb-1">Recipient address</label>
            <input
              id="transfer-to"
              type="text"
              placeholder="0x…"
              value={toAddress}
              onChange={(e) => setToAddress(e.target.value.trim())}
              className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
          </div>
          <div>
            <label htmlFor="transfer-amount" className="block text-xs text-dark-400 mb-1">Amount ({token})</label>
            <input
              id="transfer-amount"
              type="number"
              step={token === 'ETH' ? '0.001' : '0.01'}
              min="0"
              placeholder={token === 'ETH' ? '0.01' : '10.00'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
            <p className="text-xs text-dark-500 mt-1">Balance: {balance.toFixed(token === 'ETH' ? 4 : 2)} {token}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isPending || isSending}
            className="w-full py-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending || isSending ? 'Sending…' : `Send ${token}`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const SWAP_CHAINS = new Set([1, 10, 42161, 8453]);

type SwapQuote = {
  buyAmount: string;
  sellAmount: string;
  price: string;
  estimatedGas: string | null;
  sources: unknown[];
  allowanceTarget: string | null;
};

type SwapStep = 'idle' | 'quoting' | 'approving' | 'swapping' | 'success' | 'error';

function SwapModal({
  isOpen,
  onClose,
  ethBalance,
  explorerUrl,
  chainId,
  onSwapComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  ethBalance: number;
  explorerUrl: string;
  chainId: number | undefined;
  onSwapComplete?: () => void;
}) {
  const effectiveChainId = chainId ?? 1;
  const availableTokens = useMemo(() => tokensForChain(effectiveChainId), [effectiveChainId]);
  const [defSell, defBuy] = useMemo(() => defaultPair(effectiveChainId), [effectiveChainId]);

  const [sellToken, setSellToken] = useState<SwapToken>(defSell);
  const [buyToken, setBuyToken] = useState<SwapToken>(defBuy);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [step, setStep] = useState<SwapStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { address: connectedAddress, chain: connectedChain } = useAccount();

  const chainSupported = chainId != null && SWAP_CHAINS.has(chainId);

  // ---- Revalidate tokens on chain change ----
  useEffect(() => {
    const tokens = tokensForChain(effectiveChainId);
    const sellValid = tokens.some((t) => isSameToken(t, sellToken, effectiveChainId));
    const buyValid = tokens.some((t) => isSameToken(t, buyToken, effectiveChainId));
    if (!sellValid || !buyValid) {
      const [ds, db] = defaultPair(effectiveChainId);
      setSellToken(ds);
      setBuyToken(db);
      setQuote(null);
      setAmount('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveChainId]); // intentionally only depends on chainId change

  // ---- ERC-20 sell-token balance ----
  const sellTokenAddress = sellToken.isNative
    ? undefined
    : (sellToken.addresses[effectiveChainId] as `0x${string}` | undefined);

  const { data: erc20BalanceRaw } = useReadContract({
    address: sellTokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    query: { enabled: Boolean(sellTokenAddress && connectedAddress) },
  });

  const sellBalance = useMemo(() => {
    if (sellToken.isNative) return ethBalance;
    if (erc20BalanceRaw == null) return 0;
    return parseFloat(formatUnits(BigInt(erc20BalanceRaw.toString()), sellToken.decimals));
  }, [sellToken, ethBalance, erc20BalanceRaw]);

  // ---- Amount validation ----
  const numAmount = parseFloat(amount);
  const amountValid = Number.isFinite(numAmount) && numAmount > 0;
  const amountExceeds = amountValid && numAmount > sellBalance;

  // Derive sell amount in smallest unit
  const sellAmountSmallest = useMemo(() => {
    if (!amountValid) return '';
    return parseUnits(amount, sellToken.decimals).toString();
  }, [amount, sellToken.decimals, amountValid]);

  // ---- Allowance for ERC-20 sell tokens ----
  const { data: tokenAllowance, refetch: refetchAllowance } = useReadContract({
    address: sellTokenAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: quote?.allowanceTarget && connectedAddress
      ? [connectedAddress, quote.allowanceTarget as `0x${string}`]
      : undefined,
    query: { enabled: Boolean(sellTokenAddress && quote?.allowanceTarget && connectedAddress && !sellToken.isNative) },
  });

  // Check if approval is needed
  const needsApproval = useMemo(() => {
    if (sellToken.isNative || !quote?.allowanceTarget || !sellAmountSmallest) return false;
    if (tokenAllowance == null) return true;
    return BigInt(tokenAllowance.toString()) < BigInt(sellAmountSmallest);
  }, [sellToken, quote, sellAmountSmallest, tokenAllowance]);

  // ---- Token selection handlers ----
  const handleSelectSell = useCallback((token: SwapToken) => {
    if (isSameToken(token, buyToken, effectiveChainId)) {
      // Swap the pair
      setBuyToken(sellToken);
    }
    setSellToken(token);
    setQuote(null);
    setError(null);
  }, [buyToken, sellToken, effectiveChainId]);

  const handleSelectBuy = useCallback((token: SwapToken) => {
    if (isSameToken(token, sellToken, effectiveChainId)) {
      setSellToken(buyToken);
    }
    setBuyToken(token);
    setQuote(null);
    setError(null);
  }, [sellToken, buyToken, effectiveChainId]);

  // Reverse tokens
  const handleReverse = useCallback(() => {
    setSellToken(buyToken);
    setBuyToken(sellToken);
    setQuote(null);
    setError(null);
    setAmount('');
  }, [sellToken, buyToken]);

  // ---- Debounced quote fetching ----
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuote(null);
    setError(null);

    if (!amountValid || !chainSupported || !sellAmountSmallest || amountExceeds) return;

    setStep('quoting');
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/evm/swap/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chainId,
            sellToken: tokenAddress(sellToken, effectiveChainId),
            buyToken: tokenAddress(buyToken, effectiveChainId),
            sellAmount: sellAmountSmallest,
            takerAddress: '0x0000000000000000000000000000000000000000',
            slippageBps: 50,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data?.error ?? 'Quote failed');
          setStep('idle');
          return;
        }
        setQuote(data as SwapQuote);
        setStep('idle');
      } catch {
        setError('Failed to fetch quote');
        setStep('idle');
      }
    }, 500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, tokenKey(sellToken, effectiveChainId), tokenKey(buyToken, effectiveChainId), chainId, chainSupported, amountExceeds]);

  // ---- Handle approval (with USDT reset support) ----
  const handleApprove = useCallback(async () => {
    if (!sellTokenAddress || !quote?.allowanceTarget) return;
    if (!connectedAddress || !connectedChain) { setError('Wallet not connected'); return; }
    setStep('approving');
    setError(null);
    let didResetAllowance = false;
    try {
      // USDT-style reset: if current allowance > 0 and token requires reset, approve(0) first
      if (
        requiresApprovalReset(sellToken, effectiveChainId) &&
        tokenAllowance != null &&
        BigInt(tokenAllowance.toString()) > 0n
      ) {
        await writeContractAsync({
          address: sellTokenAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [quote.allowanceTarget as `0x${string}`, 0n],
          account: connectedAddress,
          chain: connectedChain,
        });
        didResetAllowance = true;
        // Refresh cached allowance so retry logic sees the on-chain 0
        await refetchAllowance();
      }

      const hash = await writeContractAsync({
        address: sellTokenAddress,
        abi: erc20Abi,
        functionName: 'approve',
        args: [quote.allowanceTarget as `0x${string}`, maxUint256],
        account: connectedAddress,
        chain: connectedChain,
      });
      toast.success(`Approval tx: ${String(hash).slice(0, 10)}…`);
      await refetchAllowance();
      setStep('idle');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/user rejected|denied/i.test(msg)) {
        toast('Approval cancelled', { icon: '🔒' });
        setStep('idle');
      } else {
        const prefix = didResetAllowance
          ? 'Allowance was reset to 0 but re-approval failed. Please approve again. '
          : '';
        const detail = msg.length > 100 ? `${msg.slice(0, 100)}…` : msg;
        setError(`${prefix}${detail}`);
        setStep('error');
      }
      // If we reset but failed to re-approve, ensure cached allowance is current
      if (didResetAllowance) void refetchAllowance();
    }
  }, [sellTokenAddress, sellToken, effectiveChainId, quote, writeContractAsync, refetchAllowance, connectedAddress, connectedChain, tokenAllowance]);

  const address = connectedAddress;

  // Handle swap execution
  const handleSwap = useCallback(async () => {
    if (!chainId || !address || !sellAmountSmallest) return;
    setStep('swapping');
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/evm/swap/tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId,
          sellToken: tokenAddress(sellToken, effectiveChainId),
          buyToken: tokenAddress(buyToken, effectiveChainId),
          sellAmount: sellAmountSmallest,
          takerAddress: address,
          slippageBps: 50,
        }),
      });
      const txData = await res.json();
      if (!res.ok || !txData.ok) {
        setError(txData?.error ?? 'Failed to get swap transaction');
        setStep('error');
        return;
      }

      const hash = await sendTransactionAsync({
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: txData.value ? BigInt(txData.value) : 0n,
        gas: txData.gas ? BigInt(txData.gas) : undefined,
      });

      setTxHash(hash);
      setStep('success');
      toast.success(`Swap submitted: ${hash.slice(0, 10)}…`);
      if (explorerUrl) {
        toast(() => (
          <a href={`${explorerUrl}/tx/${hash}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline text-cyan-400">
            View on Explorer
          </a>
        ));
      }
      onSwapComplete?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/user rejected|denied/i.test(msg)) {
        toast('Swap cancelled', { icon: '🔒' });
        setStep('idle');
      } else {
        setError(msg.length > 120 ? `${msg.slice(0, 120)}…` : msg);
        setStep('error');
      }
    }
  }, [chainId, address, sellAmountSmallest, sellToken, buyToken, effectiveChainId, sendTransactionAsync, explorerUrl, onSwapComplete]);

  // Max button
  const handleMax = useCallback(() => {
    if (sellToken.isNative) {
      const max = Math.max(0, ethBalance - 0.005);
      setAmount(max > 0 ? max.toFixed(6) : '0');
    } else {
      setAmount(sellBalance > 0 ? sellBalance.toFixed(sellToken.decimals <= 6 ? 2 : 6) : '0');
    }
  }, [sellToken, ethBalance, sellBalance]);

  // Reset when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      setQuote(null);
      setStep('idle');
      setError(null);
      setTxHash(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Format the buy amount for display
  const formattedBuyAmount = quote?.buyAmount
    ? parseFloat(formatUnits(BigInt(quote.buyAmount), buyToken.decimals)).toFixed(
        buyToken.decimals <= 6 ? 2 : 6,
      )
    : null;

  // Determine button state
  let buttonLabel = 'Enter amount';
  let buttonDisabled = true;
  let buttonAction: (() => void) | undefined;

  if (!chainSupported) {
    buttonLabel = 'Switch to supported network';
  } else if (!amountValid) {
    buttonLabel = 'Enter amount';
  } else if (amountExceeds) {
    buttonLabel = 'Insufficient balance';
  } else if (step === 'quoting') {
    buttonLabel = 'Getting quote…';
  } else if (step === 'approving') {
    buttonLabel = 'Approving…';
  } else if (step === 'swapping') {
    buttonLabel = 'Swapping…';
  } else if (step === 'success') {
    buttonLabel = 'Done';
    buttonDisabled = false;
    buttonAction = () => { setStep('idle'); setAmount(''); setQuote(null); setTxHash(null); };
  } else if (step === 'error') {
    buttonLabel = 'Retry';
    buttonDisabled = false;
    buttonAction = () => { setStep('idle'); setError(null); };
  } else if (!quote) {
    buttonLabel = 'Enter amount to get quote';
  } else if (needsApproval) {
    buttonLabel = `Approve ${sellToken.symbol}`;
    buttonDisabled = false;
    buttonAction = () => void handleApprove();
  } else {
    buttonLabel = 'Swap';
    buttonDisabled = false;
    buttonAction = () => void handleSwap();
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-[9999] w-full max-w-sm rounded-xl bg-dark-800 border border-dark-600 p-6 shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-4">
          <ArrowDownUp className="w-6 h-6 text-cyan-400" />
          <h3 className="text-lg font-bold text-white">Swap</h3>
        </div>

        <div className="space-y-3">
          {/* Sell token */}
          <div>
            <label className="block text-xs text-dark-400 mb-1">Sell</label>
            <div className="flex gap-2">
              <TokenSelector
                selected={sellToken}
                tokens={availableTokens}
                disabledToken={buyToken}
                chainId={effectiveChainId}
                onSelect={handleSelectSell}
              />
              <div className="flex-1 relative">
                <input
                  type="number"
                  step={sellToken.decimals <= 6 ? '0.01' : '0.001'}
                  min="0"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-white text-sm placeholder:text-dark-500 focus:outline-none focus:ring-1 focus:ring-cyan-400 pr-14"
                />
                <button
                  type="button"
                  onClick={handleMax}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Max
                </button>
              </div>
            </div>
            <p className="text-xs text-dark-500 mt-1">Balance: {sellBalance.toFixed(sellToken.decimals <= 6 ? 2 : 4)} {sellToken.symbol}</p>
            {amountExceeds && <p className="text-xs text-red-400 mt-1">Insufficient balance</p>}
          </div>

          {/* Reverse button */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleReverse}
              className="p-2 rounded-full bg-dark-700 hover:bg-dark-600 transition text-dark-300 hover:text-cyan-400"
              aria-label="Reverse tokens"
            >
              <ArrowDownUp className="w-4 h-4" />
            </button>
          </div>

          {/* Buy token */}
          <div>
            <label className="block text-xs text-dark-400 mb-1">Buy</label>
            <div className="flex gap-2">
              <TokenSelector
                selected={buyToken}
                tokens={availableTokens}
                disabledToken={sellToken}
                chainId={effectiveChainId}
                onSelect={handleSelectBuy}
              />
              <div className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-dark-600 text-sm text-dark-300 min-h-[38px] flex items-center">
                {step === 'quoting' ? (
                  <span className="animate-pulse">Getting quote…</span>
                ) : formattedBuyAmount ? (
                  <span className="text-white font-medium">{formattedBuyAmount} {buyToken.symbol}</span>
                ) : (
                  <span className="text-dark-500">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Quote details */}
          {quote && (
            <div className="p-3 rounded-lg bg-dark-900/50 border border-dark-700 text-xs space-y-1">
              {quote.estimatedGas && (
                <div className="flex justify-between text-dark-400">
                  <span>Est. gas</span>
                  <span>{Number(quote.estimatedGas).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-dark-400">
                <span>Slippage</span>
                <span>0.5%</span>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Success display */}
          {step === 'success' && txHash && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-300 space-y-1">
              <p>Swap submitted successfully!</p>
              {explorerUrl && (
                <a
                  href={`${explorerUrl}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 underline"
                >
                  View on Explorer
                </a>
              )}
            </div>
          )}

          {/* Action button */}
          <button
            type="button"
            onClick={buttonAction}
            disabled={buttonDisabled}
            className="w-full py-2.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buttonLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function WalletPage() {
  const { address, isConnected, chain, chainId } = useAccount();
  const { connectAsync, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: ethBalance, refetch: refetchEthBalance } = useBalance({ address });
  const usdcToken = address && chainId ? USDC_BY_CHAIN[chainId] : null;
  const { data: usdcBalanceRaw, refetch: refetchUsdcBalance } = useReadContract({
    address: usdcToken ?? undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(usdcToken && address) },
  });
  const { data: ensName } = useEnsName({ address });
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [chainSwitcherOpen, setChainSwitcherOpen] = useState(false);
  const isMobileBrowser = useMemo(() => isLikelyMobileBrowser(), []);
  const isMetaMaskBrowser = useMemo(() => isMetaMaskInAppBrowser(), []);

  // Persist EVM wallet state to localStorage (mirrors Solana wallet persistence)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isConnected && address) {
      window.localStorage.setItem('arbimind:wallet:activeChain', 'evm');
      window.localStorage.setItem('arbimind:wallet:evmConnected', '1');
      window.localStorage.setItem('arbimind:wallet:evmAddress', address);
      if (chainId) window.localStorage.setItem('arbimind:wallet:evmChainId', String(chainId));
      notifyWalletStateUpdated();
      return;
    }
    window.localStorage.setItem('arbimind:wallet:evmConnected', '0');
    window.localStorage.removeItem('arbimind:wallet:evmAddress');
    window.localStorage.removeItem('arbimind:wallet:evmChainId');
    notifyWalletStateUpdated();
  }, [isConnected, address, chainId]);

  const handleDirectMetaMaskConnect = async () => {
    const metaMaskConnector = connectors.find(
      (connector) => /metamask/i.test(connector.name) || /metamask/i.test(connector.id)
    );

    if (!metaMaskConnector) {
      toast.error('MetaMask connector is not available');
      return;
    }

    try {
      await connectAsync({ connector: metaMaskConnector });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'MetaMask connection failed');
      if (/user rejected|cancelled|rejected/i.test(message)) {
        toast('Connection cancelled', { icon: '🔒' });
        return;
      }
      toast.error(message || 'MetaMask connection failed');
    }
  };

  const ethVal = ethBalance ? parseFloat(formatUnits(ethBalance.value, ethBalance.decimals)) : 0;
  const usdcVal = usdcBalanceRaw != null ? Number(formatUnits(usdcBalanceRaw, 6)) : 0;
  const totalUsd = ethVal * 3000 + usdcVal;
  const isLowBalance = ethVal < MIN_ETH && usdcVal < MIN_USDC;
  const explorerUrl = chain?.blockExplorers?.default?.url ?? '';
  const {
    data: portfolio,
    isLoading: portfolioLoading,
    isError: portfolioError,
    error: portfolioQueryError,
    refetch: refetchPortfolio,
  } = usePortfolioSummary('evm', address ?? undefined);
  const { data: timeseries, isLoading: timeseriesLoading } = usePortfolioTimeseries('evm', address ?? undefined, '30d');
  const portfolioErrorDetails = getPortfolioErrorDetails(portfolioQueryError);

  // Cross-tab sync: when another tab writes to arbimind:wallet:* localStorage keys,
  // refresh balances and portfolio so this tab stays up-to-date.
  useEffect(() => {
    return onCrossTabWalletChange(() => {
      void refetchEthBalance();
      void refetchUsdcBalance();
      void refetchPortfolio();
    });
  }, [refetchEthBalance, refetchUsdcBalance, refetchPortfolio]);

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success('Address copied');
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast.success('EVM wallet disconnected');
  };

  const handleTransferComplete = useCallback(() => {
    void refetchEthBalance();
    void refetchUsdcBalance();
    void refetchPortfolio();
  }, [refetchEthBalance, refetchUsdcBalance, refetchPortfolio]);

  const handleSwapComplete = useCallback(() => {
    void refetchEthBalance();
    void refetchUsdcBalance();
    void refetchPortfolio();
  }, [refetchEthBalance, refetchUsdcBalance, refetchPortfolio]);

  const { data: engineStatus } = useQuery({
    queryKey: ['engine-status'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/engine/status`);
      if (!res.ok) return null;
      return res.json() as Promise<{
        active: string;
        walletChain: string | null;
        walletAddress: string | null;
        oppsCount: number;
        lastProfit: number;
        lastScanAt: number | null;
        uptime: number;
        timestamp: number;
      }>;
    },
    refetchInterval: 10_000,
    enabled: isConnected,
  });

  const isEngineActive = Boolean(engineStatus?.active);
  const isEngineSynced = engineStatus?.walletChain === 'evm' && engineStatus?.walletAddress?.toLowerCase() === address?.toLowerCase();

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
              <div className="rounded-lg bg-gradient-to-r from-cyan-500/80 to-purple-500/80 p-[1px] shadow-md">
                <div className="rounded-[calc(0.5rem-1px)] bg-[#151a29] px-1 py-1">
                  {isMetaMaskBrowser ? (
                    <button
                      type="button"
                      onClick={() => void handleDirectMetaMaskConnect()}
                      disabled={isConnectPending}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isConnectPending ? 'Connecting MetaMask…' : 'Connect MetaMask'}
                    </button>
                  ) : (
                    <ConnectButton label="Connect EVM Wallet" showBalance={false} />
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full max-w-3xl space-y-3">
                <div className="grid gap-3 rounded-2xl border border-white/10 bg-dark-900/60 p-4 shadow-xl sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-dark-400">Wallet</p>
                    <p className="mt-1 font-mono text-sm text-white">{ensName || formatAddress(address ?? '')}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-dark-400">Available funds</p>
                    <p className="mt-1 text-lg font-bold text-white">{formatUSD(totalUsd)}</p>
                    <p className="text-xs text-dark-400">{formatETH(ethVal)} ETH + {(usdcVal ?? 0).toFixed(2)} USDC</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-dark-400">Bot activation</p>
                    <p className={`mt-1 text-sm font-semibold ${isLowBalance ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {isLowBalance ? `Need at least ~$${MIN_USDC}` : 'Ready to activate'}
                    </p>
                    <p className="text-xs text-dark-400">Minimum available funds target: ${MIN_USDC}</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
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
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-6 py-2 rounded-lg border border-red-400/40 bg-red-500/10 text-red-200 font-semibold shadow-md hover:bg-red-500/20 transition"
                >
                  Disconnect Wallet
                </button>
                </div>
              </div>
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
              <div className="mb-6 flex justify-center">
                <div className="rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 p-[1px] shadow-md">
                  <div className="rounded-[calc(0.5rem-1px)] bg-[#151a29] px-1 py-1">
                    {isMetaMaskBrowser ? (
                      <button
                        type="button"
                        onClick={() => void handleDirectMetaMaskConnect()}
                        disabled={isConnectPending}
                        className="inline-flex min-h-10 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isConnectPending ? 'Connecting MetaMask…' : 'Connect MetaMask'}
                      </button>
                    ) : (
                      <ConnectButton label="Open Wallet Connect" showBalance={false} />
                    )}
                  </div>
                </div>
              </div>
              {isMobileBrowser && !isMetaMaskBrowser && (
                <div className="mb-6 flex justify-center">
                  <a
                    href={buildMetaMaskDappLink('/wallet')}
                    className="inline-flex items-center rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-200 transition hover:bg-cyan-500/20"
                  >
                    Open in MetaMask App Browser
                  </a>
                </div>
              )}
              <div className="mx-auto max-w-2xl rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-left text-sm text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">On mobile Chrome/Safari, wallet extensions are not available.</p>
                  <p className="text-amber-200/80 mt-1">
                    For best results, open ArbiMind from the browser inside MetaMask/Phantom, or use WalletConnect from the connect modal.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Unsupported network warning */}
            {chainId && !SUPPORTED_CHAIN_IDS.has(chainId) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm"
              >
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Unsupported network</p>
                  <p className="text-amber-300/70 mt-0.5">
                    Please switch to Ethereum, Arbitrum, Optimism, Base, or Polygon for full functionality.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setChainSwitcherOpen(true)}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-medium whitespace-nowrap transition"
                >
                  Switch Network
                </button>
              </motion.div>
            )}

            {/* Engine Status */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 }}
              className="flex flex-wrap items-center gap-2"
            >
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${isEngineActive ? 'border-green-500/30 bg-green-500/15 text-green-300' : 'border-dark-700 bg-dark-900/70 text-dark-300'}`}>
                Bot: {isEngineActive ? 'ARBITRAGE ACTIVE' : 'INACTIVE'}
              </span>
              {isEngineSynced && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border border-cyan-500/30 bg-cyan-500/15 text-cyan-300">
                  EVM Synced
                </span>
              )}
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border border-dark-700 bg-dark-900/70 text-dark-200">
                {engineStatus?.oppsCount ?? 0} Opps | {(engineStatus?.lastProfit ?? 0).toFixed(4)} ETH
              </span>
              <span className="text-xs text-dark-400">
                Last HB: {engineStatus?.timestamp ? new Date(engineStatus.timestamp).toISOString().slice(0, 16) + 'Z' : '\u2014'}
              </span>
            </motion.div>

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
                  <div className="text-xl font-bold text-white">{(usdcVal ?? 0).toFixed(2)}</div>
                  <div className="text-xs text-dark-400 mt-1">≈ {formatUSD(usdcVal)}</div>
                </div>
                <div className="p-4 rounded-lg bg-dark-800/50 border border-dark-700">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-dark-400">Available Funds</span>
                  </div>
                  <div className="text-xl font-bold text-white">{formatUSD(totalUsd)}</div>
                  <div className="text-xs text-dark-400 mt-1">
                    {isLowBalance ? `Below activation minimum ($${MIN_USDC})` : 'Enough to activate the bot'}
                  </div>
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
                errorDetails={portfolioErrorDetails}
                onRefresh={() => refetchPortfolio()}
                scanSkipped={portfolio?.scanSkipped}
              />
            </motion.div>

            {/* Performance Charts */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              <PerformanceCharts
                points={timeseries?.points ?? []}
                method={timeseries?.method === 'estimated_linear_ramp_to_current_equity' ? 'estimated_linear_ramp_to_current_equity' : undefined}
                isLoading={timeseriesLoading}
              />
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

            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass-card p-4 sm:p-6"
            >
              <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                <button
                  type="button"
                  onClick={() => setTransferOpen(true)}
                  className="flex items-center justify-between p-4 rounded-lg bg-dark-800/50 hover:bg-dark-700/50 border border-dark-600 transition group text-left"
                >
                  <div className="flex items-center gap-3">
                    <Send className="w-5 h-5 text-cyan-400" />
                    <span className="font-medium text-white">Send ETH / USDC</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-dark-400 group-hover:text-cyan-400" />
                </button>
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
                <button
                  type="button"
                  onClick={() => setSwapOpen(true)}
                  className="flex items-center justify-between p-4 rounded-lg bg-dark-800/50 hover:bg-dark-700/50 border border-dark-600 transition group text-left"
                >
                  <div className="flex items-center gap-3">
                    <ArrowDownUp className="w-5 h-5 text-yellow-400" />
                    <span className="font-medium text-white">Swap</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-dark-400 group-hover:text-yellow-400" />
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="flex items-center justify-between p-4 rounded-lg bg-dark-800/50 hover:bg-dark-700/50 border border-dark-600 transition group text-left"
                >
                  <div className="flex items-center gap-3">
                    <LogOut className="w-5 h-5 text-red-300" />
                    <span className="font-medium text-white">Disconnect</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-dark-400 group-hover:text-red-300" />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </div>

      <WithdrawModal isOpen={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
      <TransferModal
        isOpen={transferOpen}
        onClose={() => setTransferOpen(false)}
        ethBalance={ethVal}
        usdcBalance={usdcVal}
        explorerUrl={explorerUrl}
        chainId={chainId}
        onTransferComplete={handleTransferComplete}
      />
      <SwapModal
        isOpen={swapOpen}
        onClose={() => setSwapOpen(false)}
        ethBalance={ethVal}
        explorerUrl={explorerUrl}
        chainId={chainId}
        onSwapComplete={handleSwapComplete}
      />
      <ChainSwitcherModal
        isOpen={chainSwitcherOpen}
        onClose={() => setChainSwitcherOpen(false)}
      />
    </DashboardLayout>
  );
}
