'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from '@solana/web3.js';
import Link from 'next/link';
import { Wallet, ArrowRightLeft, ChevronLeft, Send, AlertTriangle, Shield } from 'lucide-react';
import { BaseWalletMultiButton } from '@solana/wallet-adapter-react-ui';
import toast from 'react-hot-toast';

import { API_BASE } from '@/lib/apiConfig';
import { ArbAccountCard, PerformanceCharts, ActivityTable } from '@/components/portfolio';
import { getPortfolioErrorDetails, usePortfolioSummary, usePortfolioTimeseries } from '@/hooks/usePortfolio';
import { SOL_EQUIV_DECIMALS } from '@/utils/format';

const IS_MAINNET = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'mainnet-beta';
const SOLSCAN_BASE = 'https://solscan.io';
const SOLSCAN_TX_SUFFIX = IS_MAINNET ? '' : '?cluster=devnet';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOLANA_TREASURY_ADDRESS =
  process.env.NEXT_PUBLIC_SOLANA_ARB_ACCOUNT || '6wmAm8uoPQTx9jEnGx4aDKwVFRSfdhKJfL2LJzwCmE6s';
// Override only the states that display the CTA text so it never regresses to "Select Wallet".
const SOLANA_WALLET_BUTTON_LABELS = {
  'has-wallet': 'Connect Wallet',
  'no-wallet': 'Connect Wallet',
} as const;

type BotTrade = {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  volumeSol: number;
  pnlSol: number;
  status: 'success' | 'failed';
  at: string;
};

type TransferLifecycle = 'idle' | 'signing' | 'broadcast' | 'pending' | 'confirmed' | 'finalized' | 'failed';

const MOCK_BOT_TRADES: BotTrade[] = [
  { id: 't-1001', pair: 'SOL/USDC', side: 'buy', volumeSol: 0.65, pnlSol: 0.041, status: 'success', at: '2m ago' },
  { id: 't-1000', pair: 'JUP/SOL', side: 'sell', volumeSol: 0.38, pnlSol: -0.007, status: 'failed', at: '7m ago' },
  { id: 't-0999', pair: 'RAY/SOL', side: 'buy', volumeSol: 0.51, pnlSol: 0.019, status: 'success', at: '13m ago' },
];

export default function SolanaWalletPageClient() {
  const { connection } = useConnection();
  const { publicKey, connected, sendTransaction, wallets, wallet, select, connect, connecting } = useWallet();
  const isSolanaConnected = Boolean(publicKey);
  const attemptedPhantomReconnect = useRef(false);
  const hasInstalledWallet = wallets.some((wallet) => wallet.readyState === WalletReadyState.Installed);
  const installedWalletNames = useMemo(
    () => wallets.filter((item) => item.readyState === WalletReadyState.Installed).map((item) => item.adapter.name),
    [wallets]
  );
  const [userSolBalance, setUserSolBalance] = useState(0);
  const [treasurySolBalance, setTreasurySolBalance] = useState(0);
  const [botTrades, setBotTrades] = useState<BotTrade[]>(MOCK_BOT_TRADES);
  const [loading, setLoading] = useState<string | null>(null);
  const [transferLifecycle, setTransferLifecycle] = useState<TransferLifecycle>('idle');
  const [transferSignature, setTransferSignature] = useState('');
  const transferStatusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transferStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('0.1');
  const [withdrawLifecycle, setWithdrawLifecycle] = useState<TransferLifecycle>('idle');
  const [withdrawSignature, setWithdrawSignature] = useState('');
  const withdrawStatusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const withdrawStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [swapQuoteOutAmount, setSwapQuoteOutAmount] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [engineActive, setEngineActive] = useState(false);
  const [engineWalletSynced, setEngineWalletSynced] = useState(false);
  const [engineLastHeartbeat, setEngineLastHeartbeat] = useState<number | null>(null);
  const [engineOppsCount, setEngineOppsCount] = useState(0);
  const [engineLastProfit, setEngineLastProfit] = useState(0);

  const treasuryPubkey = useMemo(() => {
    try {
      return new PublicKey(SOLANA_TREASURY_ADDRESS);
    } catch {
      return null;
    }
  }, []);

  const usdcMintPubkey = useMemo(() => {
    try {
      return new PublicKey(USDC_MINT);
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (attemptedPhantomReconnect.current || isSolanaConnected || connecting) {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const injected =
      ((window as Window & { phantom?: { solana?: { isConnected?: boolean; isPhantom?: boolean } } }).phantom?.solana as
        | { isConnected?: boolean; isPhantom?: boolean }
        | undefined) ??
      ((window as Window & { solana?: { isConnected?: boolean; isPhantom?: boolean } }).solana as
        | { isConnected?: boolean; isPhantom?: boolean }
        | undefined);

    if (!injected?.isPhantom || !injected.isConnected) {
      return;
    }

    const phantomWallet = wallets.find(
      (item) => item.readyState === WalletReadyState.Installed && /phantom/i.test(item.adapter.name)
    );
    if (!phantomWallet) {
      return;
    }

    attemptedPhantomReconnect.current = true;
    if (wallet?.adapter.name !== phantomWallet.adapter.name) {
      select(phantomWallet.adapter.name);
    }

    const timer = setTimeout(() => {
      void connect().catch(() => {
        attemptedPhantomReconnect.current = false;
      });
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [isSolanaConnected, connecting, wallets, wallet, select, connect]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (isSolanaConnected && address) {
      window.localStorage.setItem('arbimind:wallet:activeChain', 'solana');
      window.localStorage.setItem('arbimind:wallet:solanaConnected', '1');
      window.localStorage.setItem('arbimind:wallet:solanaAddress', address);
      return;
    }

    window.localStorage.setItem('arbimind:wallet:solanaConnected', '0');
    window.localStorage.removeItem('arbimind:wallet:solanaAddress');
  }, [isSolanaConnected, address]);

  useEffect(() => {
    let cancelled = false;

    const refreshBalances = async () => {
      try {
        if (publicKey) {
          const lamports = await connection.getBalance(publicKey);
          if (!cancelled) {
            setUserSolBalance(lamports / LAMPORTS_PER_SOL);
          }
        } else if (!cancelled) {
          setUserSolBalance(0);
        }

        if (treasuryPubkey) {
          const treasuryLamports = await connection.getBalance(treasuryPubkey);
          if (!cancelled) {
            setTreasurySolBalance(treasuryLamports / LAMPORTS_PER_SOL);
          }
        }
      } catch {
        if (!cancelled) {
          setUserSolBalance(0);
          setTreasurySolBalance(0);
        }
      }
    };

    void refreshBalances();
    const interval = setInterval(() => {
      void refreshBalances();
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connection, publicKey, treasuryPubkey]);

  useEffect(() => {
    let cancelled = false;

    const refreshEngineStatus = async () => {
      try {
        const response = await fetch(`${API_BASE}/engine/status`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!response.ok) {
          if (!cancelled) {
            setEngineActive(false);
            setEngineWalletSynced(false);
            setEngineLastHeartbeat(null);
            setEngineOppsCount(0);
            setEngineLastProfit(0);
          }
          return;
        }

        const payload = (await response.json()) as {
          active?: string;
          walletChain?: 'solana' | 'evm' | null;
          walletAddress?: string | null;
          timestamp?: number;
          oppsCount?: number;
          lastProfit?: number;
        };

        const active = typeof payload.active === 'string' ? payload.active.trim().length > 0 : false;
        const synced =
          isSolanaConnected &&
          !!address &&
          payload.walletChain === 'solana' &&
          typeof payload.walletAddress === 'string' &&
          payload.walletAddress === address;

        if (!cancelled) {
          setEngineActive(active);
          setEngineWalletSynced(Boolean(synced));
          setEngineLastHeartbeat(typeof payload.timestamp === 'number' ? payload.timestamp : null);
          setEngineOppsCount(Number.isFinite(payload.oppsCount) ? Math.max(0, Math.floor(payload.oppsCount as number)) : 0);
          setEngineLastProfit(Number.isFinite(payload.lastProfit) ? Number(payload.lastProfit as number) : 0);
        }
      } catch {
        if (!cancelled) {
          setEngineActive(false);
          setEngineWalletSynced(false);
          setEngineLastHeartbeat(null);
          setEngineOppsCount(0);
          setEngineLastProfit(0);
        }
      }
    };

    void refreshEngineStatus();
    const interval = setInterval(() => {
      void refreshEngineStatus();
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isSolanaConnected, address]);

  useEffect(() => {
    let cancelled = false;

    const loadTrades = async () => {
      try {
        const response = await fetch(`${API_BASE}/solana/trades`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });

        if (!response.ok) {
          if (!cancelled) {
            setBotTrades(MOCK_BOT_TRADES);
          }
          return;
        }

        const payload = (await response.json()) as {
          trades?: Array<{
            id?: string;
            pair?: string;
            side?: 'buy' | 'sell';
            volumeSol?: number;
            pnlSol?: number;
            status?: 'success' | 'failed';
            at?: string;
          }>;
        };

        const normalized = (payload.trades ?? [])
          .filter((trade) => !!trade.id)
          .map((trade) => ({
            id: trade.id as string,
            pair: trade.pair ?? 'SOL/USDC',
            side: trade.side === 'sell' ? 'sell' : 'buy',
            volumeSol: Number(trade.volumeSol ?? 0),
            pnlSol: Number(trade.pnlSol ?? 0),
            status: trade.status === 'failed' ? 'failed' : 'success',
            at: trade.at ?? 'now',
          }));

        if (!cancelled) {
          setBotTrades(normalized.length > 0 ? normalized : MOCK_BOT_TRADES);
        }
      } catch {
        if (!cancelled) {
          setBotTrades(MOCK_BOT_TRADES);
        }
      }
    };

    void loadTrades();
    const interval = setInterval(() => {
      void loadTrades();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const tradeStats = useMemo(() => {
    const total = botTrades.length;
    const successCount = botTrades.filter((trade) => trade.status === 'success').length;
    const totalPnl = botTrades.reduce((sum, trade) => sum + trade.pnlSol, 0);
    const totalVolume = botTrades.reduce((sum, trade) => sum + trade.volumeSol, 0);

    return {
      totalPnl,
      totalVolume,
      successRate: total > 0 ? (successCount / total) * 100 : 0,
    };
  }, [botTrades]);

  const connectSpecificWallet = async (matcher: RegExp, label: string) => {
    try {
      const targetWallet = wallets.find(
        (item) => item.readyState === WalletReadyState.Installed && matcher.test(item.adapter.name)
      );

      if (!targetWallet) {
        toast.error(`${label} extension not detected in this browser profile`);
        return;
      }

      if (wallet?.adapter.name !== targetWallet.adapter.name) {
        select(targetWallet.adapter.name);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      await connect();
    } catch (err: unknown) {
      const msg = String(err instanceof Error ? err.message : err ?? 'Wallet connection failed');
      if (/walletnotselectederror|wallet not selected/i.test(msg)) {
        try {
          await new Promise((resolve) => setTimeout(resolve, 180));
          await connect();
          return;
        } catch {
          // fall through to generic handling
        }
      }
      if (/user rejected|cancelled|rejected/i.test(msg)) {
        toast('Connection cancelled', { icon: '🔒' });
        return;
      }
      toast.error(msg || 'Wallet connection failed');
    }
  };

  const handleTransfer = async () => {
    if (!isSolanaConnected || !publicKey) {
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
    setTransferLifecycle('signing');
    setTransferSignature('');
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

      setTransferLifecycle('broadcast');
      toast.loading('Broadcasting...', { id: 'solana-transfer' });
      const sig = await sendTransaction(tx, connection, { preflightCommitment: 'confirmed' });
      setTransferSignature(sig);
      setTransferLifecycle('pending');
      toast.loading(`Pending: ${sig.slice(0, 8)}...${sig.slice(-8)}`, { id: 'solana-transfer' });

      if (transferStatusPollRef.current) {
        clearInterval(transferStatusPollRef.current);
        transferStatusPollRef.current = null;
      }
      if (transferStatusTimeoutRef.current) {
        clearTimeout(transferStatusTimeoutRef.current);
        transferStatusTimeoutRef.current = null;
      }

      transferStatusPollRef.current = setInterval(() => {
        void (async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/solana/tx/status/${sig}`, {
              method: 'GET',
              cache: 'no-store',
            });
            if (!statusRes.ok) return;

            const statusJson = (await statusRes.json()) as {
              status?: 'processed' | 'confirmed' | 'finalized' | 'unknown';
              err?: unknown;
              explorer?: string;
            };

            if (statusJson.err) {
              if (transferStatusPollRef.current) {
                clearInterval(transferStatusPollRef.current);
                transferStatusPollRef.current = null;
              }
              if (transferStatusTimeoutRef.current) {
                clearTimeout(transferStatusTimeoutRef.current);
                transferStatusTimeoutRef.current = null;
              }
              setTransferLifecycle('failed');
              toast.error('Transfer failed on-chain', { id: 'solana-transfer' });
              return;
            }

            if (statusJson.status === 'finalized' || statusJson.status === 'confirmed') {
              if (transferStatusPollRef.current) {
                clearInterval(transferStatusPollRef.current);
                transferStatusPollRef.current = null;
              }
              if (transferStatusTimeoutRef.current) {
                clearTimeout(transferStatusTimeoutRef.current);
                transferStatusTimeoutRef.current = null;
              }

              setTransferLifecycle(statusJson.status);
              setTransferAmount('0.1');
              setTransferToPubkey('');
              const explorerUrl = statusJson.explorer || `${SOLSCAN_BASE}/tx/${sig}${SOLSCAN_TX_SUFFIX}`;
              const label = statusJson.status === 'finalized' ? 'Finalized' : 'Confirmed';
              toast(
                (t) => (
                  <div className="flex items-center gap-2 text-sm">
                    <span>{`✅ ${label}: ${sig.slice(0, 8)}...${sig.slice(-8)}`}</span>
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline"
                      onClick={() => toast.dismiss(t.id)}
                    >
                      View
                    </a>
                  </div>
                ),
                { id: 'solana-transfer', duration: 12000 }
              );
            }
          } catch {
            // keep polling until timeout
          }
        })();
      }, 1200);

      transferStatusTimeoutRef.current = setTimeout(() => {
        if (transferStatusPollRef.current) {
          clearInterval(transferStatusPollRef.current);
          transferStatusPollRef.current = null;
        }
        transferStatusTimeoutRef.current = null;
        setTransferLifecycle((prev) => (prev === 'pending' || prev === 'broadcast' ? 'failed' : prev));
        toast.error('Transfer confirmation timeout', { id: 'solana-transfer' });
      }, 120000);
    } catch (err: unknown) {
      const msg = String(err instanceof Error ? err.message : err ?? 'Transfer failed');
      setTransferLifecycle('failed');
      if (msg.includes('disconnected port') || msg.includes('[PHANTOM]')) {
        toast('Phantom connection lost. Open Phantom to unlock, then refresh and try again.', { icon: '🔌' });
        return;
      }
      toast.error(msg || 'Transfer failed');
    } finally {
      // transfer lifecycle is managed independently from generic loading
    }
  };

  useEffect(() => {
    return () => {
      if (transferStatusPollRef.current) {
        clearInterval(transferStatusPollRef.current);
      }
      if (transferStatusTimeoutRef.current) {
        clearTimeout(transferStatusTimeoutRef.current);
      }
      if (withdrawStatusPollRef.current) {
        clearInterval(withdrawStatusPollRef.current);
      }
      if (withdrawStatusTimeoutRef.current) {
        clearTimeout(withdrawStatusTimeoutRef.current);
      }
    };
  }, []);

  const handleSwap = async () => {
    if (!isSolanaConnected || !publicKey) {
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
      setSwapQuoteOutAmount(null);
      await refreshUsdcBalance();
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

  const handleGetSwapQuote = async () => {
    if (!isSolanaConnected || !publicKey) {
      toast.error('Connect wallet first');
      return;
    }
    const amount = parseFloat(swapAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!IS_MAINNET) {
      toast.error('Quotes are mainnet-only. Set NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta');
      return;
    }

    setLoading('quote');
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
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || 'Quote failed');
        return;
      }

      const outAmountRaw = Number(body?.quote?.outAmount ?? 0);
      const outDecimals = swapSide === 'SOL_TO_USDC' ? 6 : 9;
      setSwapQuoteOutAmount(outAmountRaw > 0 ? outAmountRaw / 10 ** outDecimals : null);
      toast.success('Quote updated');
    } catch (err: unknown) {
      const msg = String(err instanceof Error ? err.message : err ?? 'Quote failed');
      toast.error(msg || 'Quote failed');
    } finally {
      setLoading(null);
    }
  };

  const refreshUsdcBalance = useCallback(async () => {
    if (!publicKey || !usdcMintPubkey) {
      setUsdcBalance(0);
      return;
    }
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: usdcMintPubkey,
      });
      if (tokenAccounts.value.length === 0) {
        setUsdcBalance(0);
        return;
      }
      const amount = tokenAccounts.value.reduce((sum, account) => {
        const parsed = account.account.data.parsed as { info?: { tokenAmount?: { uiAmount?: number | null } } };
        return sum + Number(parsed?.info?.tokenAmount?.uiAmount ?? 0);
      }, 0);
      setUsdcBalance(amount);
    } catch {
      setUsdcBalance(0);
    }
  }, [publicKey, usdcMintPubkey, connection]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      await refreshUsdcBalance();
    };

    void run();
    const interval = setInterval(() => {
      void run();
    }, 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshUsdcBalance]);

  const handleWithdraw = async () => {
    if (!isSolanaConnected || !publicKey) {
      toast.error('Connect wallet first');
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setWithdrawLifecycle('signing');
    setWithdrawSignature('');

    try {
      const res = await fetch(`${API_BASE}/solana/tx/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountSol: amount,
          fromPubkey: SOLANA_TREASURY_ADDRESS,
          toPubkey: publicKey.toBase58(),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWithdrawLifecycle('failed');
        toast.error(body.error || 'Withdraw failed');
        return;
      }

      const signature = String(body.signature || '');
      if (!signature) {
        setWithdrawLifecycle('failed');
        toast.error('Withdraw signature missing');
        return;
      }

      setWithdrawLifecycle('pending');
      setWithdrawSignature(signature);
      toast.loading(`Pending: ${signature.slice(0, 8)}...${signature.slice(-8)}`, { id: 'solana-withdraw' });

      if (withdrawStatusPollRef.current) {
        clearInterval(withdrawStatusPollRef.current);
        withdrawStatusPollRef.current = null;
      }
      if (withdrawStatusTimeoutRef.current) {
        clearTimeout(withdrawStatusTimeoutRef.current);
        withdrawStatusTimeoutRef.current = null;
      }

      withdrawStatusPollRef.current = setInterval(() => {
        void (async () => {
          try {
            const statusRes = await fetch(`${API_BASE}/solana/tx/status/${signature}`, {
              method: 'GET',
              cache: 'no-store',
            });
            if (!statusRes.ok) return;

            const statusJson = (await statusRes.json()) as {
              status?: 'processed' | 'confirmed' | 'finalized' | 'unknown';
              err?: unknown;
              explorer?: string;
            };

            if (statusJson.err) {
              if (withdrawStatusPollRef.current) {
                clearInterval(withdrawStatusPollRef.current);
                withdrawStatusPollRef.current = null;
              }
              if (withdrawStatusTimeoutRef.current) {
                clearTimeout(withdrawStatusTimeoutRef.current);
                withdrawStatusTimeoutRef.current = null;
              }
              setWithdrawLifecycle('failed');
              toast.error('Withdraw failed on-chain', { id: 'solana-withdraw' });
              return;
            }

            if (statusJson.status === 'finalized' || statusJson.status === 'confirmed') {
              if (withdrawStatusPollRef.current) {
                clearInterval(withdrawStatusPollRef.current);
                withdrawStatusPollRef.current = null;
              }
              if (withdrawStatusTimeoutRef.current) {
                clearTimeout(withdrawStatusTimeoutRef.current);
                withdrawStatusTimeoutRef.current = null;
              }

              const label = statusJson.status === 'finalized' ? 'Finalized' : 'Confirmed';
              const explorerUrl = statusJson.explorer || `${SOLSCAN_BASE}/tx/${signature}${SOLSCAN_TX_SUFFIX}`;
              setWithdrawLifecycle(statusJson.status);
              setWithdrawAmount('0.1');
              toast.success(`${label}: ${signature.slice(0, 8)}...${signature.slice(-8)}`, { id: 'solana-withdraw' });
              toast((t) => (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold underline"
                  onClick={() => toast.dismiss(t.id)}
                >
                  View withdraw on Solscan
                </a>
              ));
            }
          } catch {
            // keep polling until timeout
          }
        })();
      }, 1200);

      withdrawStatusTimeoutRef.current = setTimeout(() => {
        if (withdrawStatusPollRef.current) {
          clearInterval(withdrawStatusPollRef.current);
          withdrawStatusPollRef.current = null;
        }
        withdrawStatusTimeoutRef.current = null;
        setWithdrawLifecycle((prev) => (prev === 'pending' ? 'failed' : prev));
        toast.error('Withdraw confirmation timeout', { id: 'solana-withdraw' });
      }, 120000);
    } catch (err: unknown) {
      const msg = String(err instanceof Error ? err.message : err ?? 'Withdraw failed');
      setWithdrawLifecycle('failed');
      toast.error(msg || 'Withdraw failed');
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
              {!isSolanaConnected && (
                <div className="mt-3 flex flex-wrap gap-2 justify-center lg:justify-start">
                  <button
                    type="button"
                    onClick={() => void connectSpecificWallet(/phantom/i, 'Phantom')}
                    className="px-4 py-2 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white text-sm font-semibold transition"
                  >
                    Connect Phantom
                  </button>
                  <button
                    type="button"
                    onClick={() => void connectSpecificWallet(/solflare/i, 'Solflare')}
                    className="px-4 py-2 rounded-lg bg-amber-500/80 hover:bg-amber-400 text-black text-sm font-semibold transition"
                  >
                    Connect Solflare
                  </button>
                </div>
              )}
              {!isSolanaConnected && (
                <p className="text-xs text-dark-400 mt-2 max-w-md text-center lg:text-left">
                  The top-right <span className="font-mono">0x...</span> wallet is EVM. For this page, connect Phantom/Solflare using the button above.
                </p>
              )}
              <p className="text-xs text-dark-400/90 mt-2 max-w-md text-center lg:text-left">
                Solana status: {isSolanaConnected ? 'connected' : connecting ? 'connecting' : connected ? 'adapter-ready' : 'disconnected'}
                {' · '}Adapter: {wallet?.adapter.name ?? 'none'}{' · '}Detected: {installedWalletNames.join(', ') || 'none'}
              </p>
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
              {isSolanaConnected && address && (
                <div className="rounded-xl bg-dark-900/80 border border-cyan-500/30 px-6 py-4 flex flex-col items-center gap-2 shadow-md mt-4">
                  <span className="text-xs text-dark-400">Connected as</span>
                  <span className="font-mono text-cyan-300 text-sm break-all">{address}</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex flex-wrap items-center gap-2"
        >
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
              engineActive
                ? 'border-green-500/30 bg-green-500/15 text-green-300'
                : 'border-dark-700 bg-dark-900/70 text-dark-300'
            }`}
          >
            Bot: {engineActive ? 'ARBITRAGE ACTIVE' : 'INACTIVE'}
          </span>
          {isSolanaConnected && (
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${
                engineWalletSynced
                  ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300'
                  : 'border-dark-700 bg-dark-900/70 text-dark-300'
              }`}
            >
              {engineWalletSynced ? 'Solana Synced' : 'Solana Connected'}
            </span>
          )}
          <span className="inline-flex items-center rounded-full border border-dark-700 bg-dark-900/70 px-3 py-1 text-xs font-semibold tracking-wide text-dark-200">
            {engineOppsCount} Opps | {engineLastProfit.toFixed(SOL_EQUIV_DECIMALS)} SOL
          </span>
          <span className="text-xs text-dark-400">
            Last HB:{' '}
            {engineLastHeartbeat
              ? `${new Date(engineLastHeartbeat).toISOString().slice(0, 16)}Z`
              : '—'}
          </span>
        </motion.div>

        {!isSolanaConnected ? (
          <>
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
              {!hasInstalledWallet && (
                <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-left text-sm text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="font-medium">No Solana wallet detected.</p>
                      <p className="text-amber-200/80">
                        Enable your wallet extension in this browser profile (including Incognito if used), then reload this page.
                      </p>
                      <p className="text-amber-200/80 mt-2">
                        On mobile Chrome/Safari, open this site from Phantom or Solflare in-app browser for the most reliable Solana connection.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {/* Connect using the hero button above */}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <div className="glass-card p-4 sm:p-5 opacity-90">
                <h2 className="text-sm font-medium text-dark-300 mb-2">Your SOL Balance</h2>
                <p className="text-2xl font-bold text-white">Connect wallet</p>
              </div>
              <div className="glass-card p-4 sm:p-5 opacity-90">
                <h2 className="text-sm font-medium text-dark-300 mb-2">Bot Treasury Balance</h2>
                <p className="text-2xl font-bold text-cyan-300">{treasurySolBalance.toFixed(4)} SOL</p>
                <p className="text-xs text-dark-500 mt-1 break-all">{SOLANA_TREASURY_ADDRESS}</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            >
              <div className="glass-card p-4 sm:p-5 opacity-90">
                <h2 className="text-sm font-medium text-dark-300 mb-2">PnL</h2>
                <p className={`text-2xl font-bold ${tradeStats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {tradeStats.totalPnl >= 0 ? '+' : ''}{tradeStats.totalPnl.toFixed(4)} SOL
                </p>
              </div>
              <div className="glass-card p-4 sm:p-5 opacity-90">
                <h2 className="text-sm font-medium text-dark-300 mb-2">Volume</h2>
                <p className="text-2xl font-bold text-white">{tradeStats.totalVolume.toFixed(4)} SOL</p>
              </div>
              <div className="glass-card p-4 sm:p-5 opacity-90">
                <h2 className="text-sm font-medium text-dark-300 mb-2">Success Rate</h2>
                <p className="text-2xl font-bold text-cyan-300">{tradeStats.successRate.toFixed(1)}%</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4 sm:p-6"
            >
              <h2 className="text-lg font-bold text-white mb-4">Recent Bot Trades</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-dark-400 border-b border-dark-700">
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3">Pair</th>
                      <th className="py-2 pr-3">Side</th>
                      <th className="py-2 pr-3">Volume (SOL)</th>
                      <th className="py-2 pr-3">PnL</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {botTrades.map((trade) => (
                      <tr key={trade.id} className="border-b border-dark-800 text-dark-200">
                        <td className="py-2 pr-3 font-mono text-xs text-dark-300">{trade.id}</td>
                        <td className="py-2 pr-3">{trade.pair}</td>
                        <td className="py-2 pr-3 uppercase text-xs">{trade.side}</td>
                        <td className="py-2 pr-3">{trade.volumeSol.toFixed(3)}</td>
                        <td className={`py-2 pr-3 ${trade.pnlSol >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.pnlSol >= 0 ? '+' : ''}{trade.pnlSol.toFixed(4)} SOL
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${trade.status === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                            {trade.status}
                          </span>
                        </td>
                        <td className="py-2 text-dark-400">{trade.at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-1 rounded-lg border border-green-500/20 bg-green-500/10 p-4"
            >
              <div className="flex items-center gap-2 text-green-300">
                <Shield className="h-5 w-5 text-green-400" />
                <span className="text-sm font-medium">
                  ✅ Verified Treasury: {`${SOLANA_TREASURY_ADDRESS.slice(0, 4)}...${SOLANA_TREASURY_ADDRESS.slice(-4)}`} | Funds secure
                </span>
              </div>
            </motion.div>

            {/* User + Treasury Balances */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <div className="glass-card p-4 sm:p-5">
                <h2 className="text-sm font-medium text-dark-300 mb-2">Your SOL Balance</h2>
                <p className="text-2xl font-bold text-white">{userSolBalance.toFixed(4)} SOL</p>
              </div>
              <div className="glass-card p-4 sm:p-5">
                <h2 className="text-sm font-medium text-dark-300 mb-2">Bot Treasury Balance</h2>
                <p className="text-2xl font-bold text-cyan-300">{treasurySolBalance.toFixed(4)} SOL</p>
                <p className="text-xs text-dark-500 mt-1 break-all">{SOLANA_TREASURY_ADDRESS}</p>
              </div>
            </motion.div>

            {/* Trading Stats */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            >
              <div className="glass-card p-4 sm:p-5">
                <h2 className="text-sm font-medium text-dark-300 mb-2">PnL</h2>
                <p className={`text-2xl font-bold ${tradeStats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {tradeStats.totalPnl >= 0 ? '+' : ''}{tradeStats.totalPnl.toFixed(4)} SOL
                </p>
              </div>
              <div className="glass-card p-4 sm:p-5">
                <h2 className="text-sm font-medium text-dark-300 mb-2">Volume</h2>
                <p className="text-2xl font-bold text-white">{tradeStats.totalVolume.toFixed(4)} SOL</p>
              </div>
              <div className="glass-card p-4 sm:p-5">
                <h2 className="text-sm font-medium text-dark-300 mb-2">Success Rate</h2>
                <p className="text-2xl font-bold text-cyan-300">{tradeStats.successRate.toFixed(1)}%</p>
              </div>
            </motion.div>

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

            {/* Recent Bot Trades */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4 sm:p-6"
            >
              <h2 className="text-lg font-bold text-white mb-4">Recent Bot Trades</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-dark-400 border-b border-dark-700">
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3">Pair</th>
                      <th className="py-2 pr-3">Side</th>
                      <th className="py-2 pr-3">Volume (SOL)</th>
                      <th className="py-2 pr-3">PnL</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {botTrades.map((trade) => (
                      <tr key={trade.id} className="border-b border-dark-800 text-dark-200">
                        <td className="py-2 pr-3 font-mono text-xs text-dark-300">{trade.id}</td>
                        <td className="py-2 pr-3">{trade.pair}</td>
                        <td className="py-2 pr-3 uppercase text-xs">{trade.side}</td>
                        <td className="py-2 pr-3">{trade.volumeSol.toFixed(3)}</td>
                        <td className={`py-2 pr-3 ${trade.pnlSol >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.pnlSol >= 0 ? '+' : ''}{trade.pnlSol.toFixed(4)} SOL
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`text-xs px-2 py-1 rounded-full ${trade.status === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                            {trade.status}
                          </span>
                        </td>
                        <td className="py-2 text-dark-400">{trade.at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                  disabled={transferLifecycle === 'signing' || transferLifecycle === 'broadcast' || transferLifecycle === 'pending'}
                  className="w-full xs:w-auto px-4 py-3 rounded-lg bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-400 font-medium hover:from-cyan-500/30 hover:to-purple-500/30 transition disabled:opacity-50"
                >
                  {transferLifecycle === 'signing'
                    ? 'Signing…'
                    : transferLifecycle === 'broadcast'
                      ? 'Broadcasting…'
                      : transferLifecycle === 'pending'
                        ? `Pending: ${transferSignature ? `${transferSignature.slice(0, 8)}...` : 'tx'}`
                        : transferLifecycle === 'confirmed' || transferLifecycle === 'finalized'
                          ? '✅ Confirmed'
                          : transferLifecycle === 'failed'
                            ? 'Failed'
                            : 'Transfer (0.5% fee)'}
                </button>
                {transferSignature && (
                  <p className="text-xs text-cyan-300 break-all">
                    Tx: {transferSignature}{' '}
                    <a
                      href={`${SOLSCAN_BASE}/tx/${transferSignature}${SOLSCAN_TX_SUFFIX}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-cyan-300 hover:text-cyan-200"
                    >
                      View on Solscan
                    </a>
                  </p>
                )}
                <p className="text-xs text-dark-500">
                  Non-custodial. You sign with your wallet. Fee goes to protocol.
                </p>
              </div>
            </motion.div>

            {/* Withdraw SOL (treasury -> connected wallet) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4 sm:p-6"
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Send className="w-5 h-5 text-green-400" />
                Withdraw from Treasury
              </h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="withdraw-amount" className="block text-sm font-medium text-dark-300 mb-2">Amount (SOL)</label>
                  <input
                    id="withdraw-amount"
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg bg-dark-800 border border-dark-600 text-white text-sm focus:outline-none focus:border-green-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleWithdraw}
                  disabled={!isSolanaConnected || withdrawLifecycle === 'signing' || withdrawLifecycle === 'pending'}
                  className="w-full xs:w-auto px-4 py-3 rounded-lg bg-green-500/20 border border-green-500/30 text-green-300 font-medium hover:bg-green-500/30 transition disabled:opacity-50"
                >
                  {withdrawLifecycle === 'signing'
                    ? 'Preparing…'
                    : withdrawLifecycle === 'pending'
                      ? `Pending: ${withdrawSignature ? `${withdrawSignature.slice(0, 8)}...` : 'tx'}`
                      : withdrawLifecycle === 'confirmed' || withdrawLifecycle === 'finalized'
                        ? '✅ Withdraw confirmed'
                        : `Withdraw to ${publicKey ? `${publicKey.toBase58().slice(0, 8)}...` : 'wallet'}`}
                </button>
                {withdrawSignature && (
                  <p className="text-xs text-green-300 break-all">
                    Tx: {withdrawSignature}{' '}
                    <a
                      href={`${SOLSCAN_BASE}/tx/${withdrawSignature}${SOLSCAN_TX_SUFFIX}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-green-300 hover:text-green-200"
                    >
                      View on Solscan
                    </a>
                  </p>
                )}
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
                  onClick={handleGetSwapQuote}
                  disabled={!!loading || !IS_MAINNET}
                  className="w-full xs:w-auto px-4 py-3 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-medium hover:bg-cyan-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading === 'quote' ? 'Getting quote…' : 'Get Quote'}
                </button>
                {swapQuoteOutAmount !== null && (
                  <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/10 text-sm space-y-1">
                    <p className="text-green-300">
                      Receive: {swapQuoteOutAmount.toFixed(SOL_EQUIV_DECIMALS)} {swapSide === 'SOL_TO_USDC' ? 'USDC' : 'SOL'}
                    </p>
                    <p className="text-dark-300">USDC ATA Balance: {usdcBalance.toFixed(SOL_EQUIV_DECIMALS)} USDC</p>
                  </div>
                )}
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
