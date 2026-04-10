'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import toast from 'react-hot-toast';
import { formatAddress } from '@/utils/format';
import { apiUrl } from '@/lib/apiConfig';
import {
  TrendingUp,
  DollarSign,
  Zap,
  Shield,
  CheckCircle2,
  Sparkles,
  Activity,
  Clock,
  Star,
  X,
  Wallet,
  Loader2,
} from 'lucide-react';

const DAILY_RATES = [0.0015, 0.0035, 0.0065] as const;
const RISK_LABELS = ['Conservative', 'Balanced', 'Aggressive'] as const;
const RISK_DESCS = ['~0.15%/day', '~0.35%/day', '~0.65%/day'] as const;
const SPEED_LABELS = ['Standard', 'Priority', 'Ultra'] as const;
const SPEED_DESCS = ['1–2 trades/hr', '4–6 trades/hr', '10+/hr'] as const;
const BOT_FEE = 29;
const MAX_BOTS_FALLBACK = Number(process.env.NEXT_PUBLIC_MAX_CONCURRENT_BOTS || '120');

type WalletKey = 'metamask' | 'walletconnect' | 'coinbase' | 'phantom';
type ModalStep = 'wallet' | 'connecting' | 'plan' | 'summary' | 'success';

interface ActivationPaymentInfo {
  paymentRequired: boolean;
  amount: number;
  currency: string;
  address: string | null;
  provider: string;
}

const BOT_STATS = [
  { trades: '~6', winRate: '71%' },
  { trades: '~18', winRate: '74%' },
  { trades: '~42', winRate: '76%' },
] as const;

const PLANS = [
  { name: 'Starter', price: 0, label: 'Free', color: 'text-dark-300', border: 'border-dark-600', bg: 'bg-dark-800/40', features: ['Manual trade scans', '1 strategy', 'Basic analytics'] },
  { name: 'Auto Trader', price: 29, label: '$29/mo', color: 'text-cyan-300', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10', features: ['Full auto-bot', '4 strategies', 'Live opportunities', '24/7 execution'] },
  { name: 'Passive Income', price: 79, label: '$79/mo', color: 'text-purple-300', border: 'border-purple-500/40', bg: 'bg-purple-500/10', features: ['Everything in Auto', '10 strategies', 'Priority speed', 'AI confidence radar'] },
  { name: 'Elite', price: 199, label: '$199/mo', color: 'text-amber-300', border: 'border-amber-500/40', bg: 'bg-amber-500/10', features: ['Everything in Passive', 'Ultra speed', 'Direct RPC routing', 'Dedicated support'] },
] as const;

const WALLET_OPTIONS: Array<{ key: WalletKey; label: string; icon: string; matcher: RegExp }> = [
  { key: 'metamask', label: 'MetaMask', icon: 'M', matcher: /meta/i },
  { key: 'walletconnect', label: 'WalletConnect', icon: 'W', matcher: /walletconnect/i },
  { key: 'coinbase', label: 'Coinbase', icon: 'C', matcher: /coinbase/i },
  { key: 'phantom', label: 'Phantom', icon: 'P', matcher: /phantom/i },
];

function formatUSD(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function getRecommendedPlan(net: number) {
  if (net < 120) return { index: 1, label: 'Auto Trader', tagline: 'Best entry point' };
  if (net < 400) return { index: 2, label: 'Passive Income', tagline: 'Best ROI' };
  return { index: 3, label: 'Elite', tagline: 'Maximum returns' };
}

export function ProfitCalculator() {
  const [capital, setCapital] = useState(1500);
  const [riskIndex, setRiskIndex] = useState<0 | 1 | 2>(1);
  const [speedIndex, setSpeedIndex] = useState<0 | 1 | 2>(1);
  const [slotsRemaining, setSlotsRemaining] = useState(12);
  const [capacityMeta, setCapacityMeta] = useState({
    maxConcurrentBots: MAX_BOTS_FALLBACK,
    rpcThroughput: 0,
    queueSize: 0,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('wallet');
  const [selectedWallet, setSelectedWallet] = useState<WalletKey>('metamask');
  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number>(2);
  const [activating, setActivating] = useState(false);
  const [activationToken, setActivationToken] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<ActivationPaymentInfo | null>(null);
  const [paymentCopied, setPaymentCopied] = useState(false);
  const [activationBotActive, setActivationBotActive] = useState(false);
  const [selectedPlanAtActivation, setSelectedPlanAtActivation] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();

  const { monthlyProfit, netProfit, roi, rangeLow, rangeHigh, recommended } = useMemo(() => {
    const monthly = capital * DAILY_RATES[riskIndex] * 30;
    const net = monthly - BOT_FEE;
    const r = (net / capital) * 100;
    return {
      monthlyProfit: monthly,
      netProfit: net,
      roi: r,
      rangeLow: monthly * 0.65,
      rangeHigh: monthly * 1.45,
      recommended: getRecommendedPlan(net),
    };
  }, [capital, riskIndex]);

  useEffect(() => {
    setSelectedPlanIndex(recommended.index);
  }, [recommended.index]);

  useEffect(() => {
    let cancelled = false;

    const pollCapacity = async () => {
      try {
        const [statusRes, rpcRes] = await Promise.all([
          fetch(apiUrl('/engine/status')),
          fetch(apiUrl('/rpc/health')),
        ]);

        const statusJson = statusRes.ok ? await statusRes.json() : null;
        const rpcJson = rpcRes.ok ? await rpcRes.json() : null;

        const queueSize = Number(statusJson?.oppsCount ?? 0);
        const maxConcurrentBots = MAX_BOTS_FALLBACK;

        const details = rpcJson?.details && typeof rpcJson.details === 'object' ? Object.values(rpcJson.details as Record<string, { status?: string; latencyMs?: number }>) : [];
        const healthyLatencies = details
          .filter((item) => item.status === 'healthy' && typeof item.latencyMs === 'number')
          .map((item) => Number(item.latencyMs));
        const avgLatency = healthyLatencies.length > 0
          ? healthyLatencies.reduce((acc, n) => acc + n, 0) / healthyLatencies.length
          : 220;

        const rpcThroughput = Math.max(120, Math.round(120000 / Math.max(avgLatency, 80)));
        const queuePressure = Math.floor(queueSize / 2);
        const utilization = Math.floor(queueSize * 0.4);
        const throughputBudget = Math.floor(rpcThroughput / 25);
        const computedSlots = Math.max(3, Math.min(maxConcurrentBots, throughputBudget + (maxConcurrentBots - utilization - queuePressure)));

        if (!cancelled) {
          setSlotsRemaining(computedSlots);
          setCapacityMeta({
            maxConcurrentBots,
            rpcThroughput,
            queueSize,
          });
        }
      } catch {
        const fallbackQueue = 8 + speedIndex * 3 + Math.floor(capital / 2500);
        const fallbackThroughput = 420 + speedIndex * 90;
        const fallbackSlots = Math.max(4, MAX_BOTS_FALLBACK - Math.floor(fallbackQueue * 1.3));
        if (!cancelled) {
          setSlotsRemaining(fallbackSlots);
          setCapacityMeta({
            maxConcurrentBots: MAX_BOTS_FALLBACK,
            rpcThroughput: fallbackThroughput,
            queueSize: fallbackQueue,
          });
        }
      }
    };

    void pollCapacity();
    const id = setInterval(() => {
      void pollCapacity();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [capital, speedIndex]);

  const selectedPlan = PLANS[selectedPlanIndex] ?? PLANS[recommended.index];

  const handleOpenModal = () => {
    setSelectedPlanIndex(recommended.index);
    setPaymentInfo(null);
    setPaymentCopied(false);
    setActivationToken(null);
    setActivationBotActive(false);
    setSelectedPlanAtActivation(null);
    setModalStep(isConnected ? 'plan' : 'wallet');
    setModalOpen(true);
  };

  const copyPaymentAddress = async () => {
    if (!paymentInfo?.address) return;
    try {
      await navigator.clipboard.writeText(paymentInfo.address);
      setPaymentCopied(true);
      toast.success('Payment address copied');
      setTimeout(() => setPaymentCopied(false), 1500);
    } catch {
      toast.error('Unable to copy address');
    }
  };

  const connectorForWallet = (wallet: WalletKey) => {
    const pattern = WALLET_OPTIONS.find((option) => option.key === wallet)?.matcher;
    if (!pattern) return undefined;
    return connectors.find((connector) => pattern.test(connector.id) || pattern.test(connector.name));
  };

  const connectSelectedWallet = async () => {
    const connector = connectorForWallet(selectedWallet);
    if (!connector) {
      toast.error('This wallet option is not available on this device.');
      return;
    }

    try {
      setModalStep('connecting');
      await connectAsync({ connector });
      setModalStep('plan');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed';
      if (/rejected|cancelled|canceled/i.test(message)) {
        toast('Connection cancelled', { icon: '🔒' });
      } else {
        toast.error(message);
      }
      setModalStep('wallet');
    }
  };

  const activatePlan = async () => {
    if (!address) {
      toast.error('Connect wallet first');
      setModalStep('wallet');
      return;
    }

    try {
      setActivating(true);
      const response = await fetch(apiUrl('/activate-bot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address,
          selectedPlan: selectedPlan.name,
          capital,
          risk: RISK_LABELS[riskIndex],
          speed: SPEED_LABELS[speedIndex],
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Activation failed (HTTP ${response.status})`);
      }

      const parsedPayment: ActivationPaymentInfo = {
        paymentRequired: Boolean(data?.payment?.paymentRequired),
        amount: Number(data?.payment?.amount ?? 0),
        currency: typeof data?.payment?.currency === 'string' ? data.payment.currency : 'USDC',
        address: typeof data?.payment?.address === 'string' && data.payment.address.trim().length > 0
          ? data.payment.address.trim()
          : null,
        provider: typeof data?.payment?.provider === 'string' ? data.payment.provider : 'manual_usdc',
      };

      if (typeof window !== 'undefined' && typeof data?.sessionToken === 'string') {
        window.localStorage.setItem('arbimind:activation:token', data.sessionToken);
      }
      setActivationToken(typeof data?.sessionToken === 'string' ? data.sessionToken : null);
      setPaymentInfo(parsedPayment);
      setActivationBotActive(Boolean(data?.user?.botActive));
      setSelectedPlanAtActivation(typeof data?.user?.selectedPlan === 'string' ? data.user.selectedPlan : selectedPlan.name);
      setModalStep('success');
      if (parsedPayment.paymentRequired) {
        toast.success('Activation saved. Payment required to start trading.');
      } else {
        toast.success('Activation started');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Activation failed';
      toast.error(message);
    } finally {
      setActivating(false);
    }
  };

  const bullets = [
    { icon: Zap, text: 'Bot runs 24/7 — no manual monitoring needed' },
    { icon: Shield, text: 'Funds stay in your wallet at all times' },
    { icon: CheckCircle2, text: 'Only profitable trades are executed' },
    { icon: TrendingUp, text: 'Performance fee applied only on gains' },
  ];

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-card p-4 sm:p-6 lg:p-8"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/20 border border-cyan-500/30">
            <DollarSign className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Profit Calculator</h2>
            <p className="text-xs sm:text-sm text-dark-400">Slide to estimate your monthly returns with ArbiMind</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Left — Controls */}
          <div className="space-y-6">
            {/* Capital slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-dark-300">Starting Capital</label>
                <span className="text-base font-bold text-white">{formatUSD(capital)}</span>
              </div>
              <input
                type="range"
                min={500}
                max={10000}
                step={100}
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                aria-label="Starting capital"
                title="Starting capital"
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-cyan-400"
                style={{
                  background: `linear-gradient(to right, rgb(34 211 238) 0%, rgb(34 211 238) ${((capital - 500) / 9500) * 100}%, rgb(38 38 58) ${((capital - 500) / 9500) * 100}%, rgb(38 38 58) 100%)`,
                }}
              />
              <div className="flex justify-between text-xs text-dark-500 mt-1">
                <span>$500</span>
                <span>$10,000</span>
              </div>
            </div>

            {/* Risk Level */}
            <div>
              <label className="text-sm font-semibold text-dark-300 mb-2 block">Risk Level</label>
              <div className="grid grid-cols-3 gap-2">
                {RISK_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setRiskIndex(i as 0 | 1 | 2)}
                    className={`flex flex-col items-center rounded-xl border px-2 py-2.5 text-xs font-medium transition-all ${
                      riskIndex === i
                        ? 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300'
                        : 'border-dark-600 bg-dark-800/50 text-dark-400 hover:border-dark-500 hover:text-dark-300'
                    }`}
                  >
                    <span className="font-semibold">{label}</span>
                    <span className="text-[10px] mt-0.5 opacity-70">{RISK_DESCS[i]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bot Speed */}
            <div>
              <label className="text-sm font-semibold text-dark-300 mb-2 block">Bot Speed</label>
              <div className="grid grid-cols-3 gap-2">
                {SPEED_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSpeedIndex(i as 0 | 1 | 2)}
                    className={`flex flex-col items-center rounded-xl border px-2 py-2.5 text-xs font-medium transition-all ${
                      speedIndex === i
                        ? 'border-purple-400/60 bg-purple-500/20 text-purple-300'
                        : 'border-dark-600 bg-dark-800/50 text-dark-400 hover:border-dark-500 hover:text-dark-300'
                    }`}
                  >
                    <span className="font-semibold">{label}</span>
                    <span className="text-[10px] mt-0.5 opacity-70">{SPEED_DESCS[i]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bot activity stats */}
            <div className="rounded-xl border border-dark-600/60 bg-dark-800/40 px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="flex items-center gap-2 text-xs text-dark-300">
                <Activity className="h-3 w-3 text-cyan-400/70 flex-shrink-0" />
                <span>{BOT_STATS[speedIndex].trades} trades/day</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-dark-300">
                <TrendingUp className="h-3 w-3 text-green-400/70 flex-shrink-0" />
                <span>{BOT_STATS[speedIndex].winRate} win rate</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-dark-300">
                <Clock className="h-3 w-3 text-purple-400/70 flex-shrink-0" />
                <span>24/7 execution</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-dark-300">
                <Shield className="h-3 w-3 text-amber-400/70 flex-shrink-0" />
                <span>Capital stays in wallet</span>
              </div>
            </div>

            {/* Bullet trust signals */}
            <ul className="space-y-2">
              {bullets.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-xs text-dark-300">
                  <Icon className="h-3.5 w-3.5 flex-shrink-0 text-cyan-400/70" />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — Output card + CTA */}
          <div className="flex flex-col justify-between gap-5">
            <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-900/30 via-dark-900/60 to-purple-900/30 p-5 sm:p-6">
              {/* Recommended plan badge */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={recommended.label}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2 mb-4"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-300">
                    Recommended Plan:
                  </span>
                  <span className="text-xs font-bold text-white">{recommended.label}</span>
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                    {recommended.tagline}
                  </span>
                </motion.div>
              </AnimatePresence>

              <p className="text-xs font-semibold uppercase tracking-widest text-dark-400 mb-3">
                Estimated Monthly Results
              </p>
              <div className="space-y-3">
                {/* Gross profit with range */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-dark-300 mt-0.5">Estimated Profit</span>
                  <div className="text-right">
                    <motion.div
                      key={monthlyProfit}
                      initial={{ opacity: 0.4, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className="text-base font-bold text-white"
                    >
                      {formatUSD(monthlyProfit)}
                    </motion.div>
                    <motion.div
                      key={rangeLow}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      className="text-[11px] text-dark-400"
                    >
                      Range: {formatUSD(rangeLow)} – {formatUSD(rangeHigh)}
                    </motion.div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-dark-300">Bot Fee</span>
                  <span className="text-sm text-dark-400">−{formatUSD(BOT_FEE)}</span>
                </div>

                <div className="my-1 h-px bg-dark-600/60" />

                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Net Profit</span>
                  <motion.span
                    key={netProfit}
                    initial={{ opacity: 0.4, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className={`text-xl font-extrabold ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {formatUSD(Math.max(netProfit, 0))}
                  </motion.span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-dark-300">Monthly ROI</span>
                  <motion.span
                    key={roi}
                    initial={{ opacity: 0.4, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className={`text-sm font-bold ${roi >= 0 ? 'text-cyan-400' : 'text-dark-400'}`}
                  >
                    {Math.max(roi, 0).toFixed(1)}%
                  </motion.span>
                </div>
              </div>

              <p className="mt-4 text-[10px] text-dark-500 leading-relaxed">
                Estimates based on historical arbitrage performance. Past results do not guarantee future returns.
                Actual profits depend on market conditions and capital deployment.
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleOpenModal}
                className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold shadow-lg shadow-cyan-900/40 transition hover:scale-[1.02] active:scale-[0.98]"
              >
                <Zap className="h-4 w-4" />
                Start Earning Passively
              </button>
              <p className="text-center text-[11px] text-amber-400/80">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse" />
                Priority slots available: {slotsRemaining} remaining
              </p>
              <p className="text-center text-[10px] text-dark-500">
                Capacity model: {capacityMeta.maxConcurrentBots} max bots - {capacityMeta.rpcThroughput} rpm RPC budget - queue {capacityMeta.queueSize}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Pricing tiers */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="glass-card p-4 sm:p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Star className="h-4 w-4 text-amber-400" />
          <h3 className="text-base sm:text-lg font-bold text-white">Choose Your Plan</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {PLANS.map((plan, i) => {
            const isRecommended = i === recommended.index;
            return (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-xl border p-3 sm:p-4 transition-all ${plan.border} ${plan.bg} ${
                  isRecommended ? 'ring-2 ring-cyan-400/40 scale-[1.02]' : ''
                }`}
              >
                {isRecommended && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-cyan-500 px-2 py-0.5 text-[10px] font-bold text-dark-950 whitespace-nowrap">
                    Recommended
                  </span>
                )}
                <div className="mb-2">
                  <p className={`text-xs sm:text-sm font-bold ${plan.color}`}>{plan.name}</p>
                  <p className="text-base sm:text-lg font-extrabold text-white mt-0.5">{plan.label}</p>
                </div>
                <ul className="space-y-1 mt-auto">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[10px] sm:text-xs text-dark-300">
                      <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-400/70 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </motion.div>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setModalOpen(false)} aria-hidden />
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="relative z-10 w-full max-w-md rounded-2xl border border-dark-600 bg-dark-900 p-5 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Connect Wallet to Activate Bot</h4>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-dark-300 transition hover:bg-dark-800 hover:text-white"
                  onClick={() => setModalOpen(false)}
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mb-5 flex items-center justify-center gap-1.5">
                {(['wallet', 'connecting', 'plan', 'summary', 'success'] as ModalStep[]).map((step, idx) => {
                  const order = { wallet: 0, connecting: 1, plan: 2, summary: 3, success: 4 };
                  const activeOrder = order[modalStep];
                  const current = order[step] === activeOrder;
                  const done = order[step] < activeOrder;
                  return (
                    <span
                      key={step}
                      className={`h-1.5 rounded-full transition-all ${current ? 'w-6 bg-cyan-400' : 'w-2'} ${done ? 'bg-cyan-500/80' : current ? '' : 'bg-dark-600'}`}
                    />
                  );
                })}
              </div>

              {modalStep === 'wallet' && (
                <div>
                  <p className="mb-3 text-xs text-dark-300">Step 1: Choose your wallet</p>
                  <div className="grid grid-cols-2 gap-2">
                    {WALLET_OPTIONS.map((wallet) => {
                      const available = Boolean(connectorForWallet(wallet.key));
                      return (
                        <button
                          key={wallet.key}
                          type="button"
                          onClick={() => setSelectedWallet(wallet.key)}
                          disabled={!available}
                          className={`rounded-xl border p-3 text-left transition ${
                            selectedWallet === wallet.key
                              ? 'border-cyan-400/60 bg-cyan-500/15'
                              : 'border-dark-600 bg-dark-800/50 hover:border-dark-500'
                          } ${available ? '' : 'opacity-50 cursor-not-allowed'}`}
                        >
                          <div className="mb-1.5 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-dark-500 bg-dark-700 text-xs font-bold text-cyan-300">
                            {wallet.icon}
                          </div>
                          <p className="text-xs font-semibold text-white">{wallet.label}</p>
                          <p className="text-[10px] text-dark-400">{available ? 'Available' : 'Unavailable'}</p>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => void connectSelectedWallet()}
                    disabled={isConnectPending}
                    className="mt-4 w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-dark-950 transition hover:bg-cyan-400 disabled:opacity-70"
                  >
                    Continue
                  </button>
                </div>
              )}

              {modalStep === 'connecting' && (
                <div className="py-8 text-center">
                  <Loader2 className="mx-auto mb-3 h-9 w-9 animate-spin text-cyan-400" />
                  <p className="text-sm font-semibold text-white">Connecting {WALLET_OPTIONS.find((w) => w.key === selectedWallet)?.label}...</p>
                  <p className="mt-1 text-xs text-dark-400">Confirm the connection in your wallet app</p>
                </div>
              )}

              {modalStep === 'plan' && (
                <div>
                  <p className="mb-3 text-xs text-dark-300">Step 2: Select plan</p>
                  {address && (
                    <p className="mb-3 inline-flex rounded-full border border-dark-600 bg-dark-800 px-3 py-1 text-[10px] text-dark-300">
                      Wallet connected: {formatAddress(address)}
                    </p>
                  )}
                  <div className="space-y-2">
                    {PLANS.slice(1).map((plan, idx) => {
                      const planIndex = idx + 1;
                      const selected = selectedPlanIndex === planIndex;
                      const recommendedPlan = planIndex === recommended.index;
                      return (
                        <button
                          key={plan.name}
                          type="button"
                          onClick={() => setSelectedPlanIndex(planIndex)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                            selected ? 'border-cyan-400/60 bg-cyan-500/15' : 'border-dark-600 bg-dark-800/40 hover:border-dark-500'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-white">{plan.name}</p>
                              <p className="text-[11px] text-dark-400">{plan.features[0]}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-white">{plan.label}</p>
                              {recommendedPlan && (
                                <span className="inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                  Recommended
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalStep('summary')}
                    className="mt-4 w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-dark-950 transition hover:bg-cyan-400"
                  >
                    Continue to Summary
                  </button>
                </div>
              )}

              {modalStep === 'summary' && (
                <div>
                  <p className="mb-3 text-xs text-dark-300">Step 3: Review and activate</p>
                  <div className="rounded-xl border border-dark-600 bg-dark-800/40 p-3 text-sm">
                    <div className="mb-2 flex items-center justify-between text-dark-300">
                      <span>Plan</span>
                      <span className="font-semibold text-white">{selectedPlan.name}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-dark-300">
                      <span>Monthly fee</span>
                      <span className="font-semibold text-white">{selectedPlan.label}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between text-dark-300">
                      <span>Estimated profit range</span>
                      <span className="font-semibold text-green-300">{formatUSD(rangeLow)} - {formatUSD(rangeHigh)}</span>
                    </div>
                    <div className="flex items-center justify-between text-dark-300">
                      <span>Priority slots</span>
                      <span className="font-semibold text-amber-300">{slotsRemaining} remaining</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void activatePlan()}
                    disabled={activating}
                    className="mt-4 w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-dark-950 transition hover:bg-cyan-400 disabled:opacity-70"
                  >
                    {activating ? 'Activating...' : 'Subscribe and Activate Bot'}
                  </button>
                </div>
              )}

              {modalStep === 'success' && (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-green-500/20">
                    <CheckCircle2 className="h-6 w-6 text-green-400" />
                  </div>
                  <p className="text-base font-bold text-white">
                    {paymentInfo?.paymentRequired ? 'Activation saved' : 'Bot activation started'}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-cyan-300">Bot warming up...</p>
                  <p className="mt-1 text-xs text-dark-300">First trades expected in ~2-5 minutes</p>
                  <p className="mt-1 text-xs text-dark-400">
                    Your wallet is connected and {(selectedPlanAtActivation ?? selectedPlan.name)} is selected.
                  </p>
                  {activationToken && (
                    <p className="mt-2 text-[10px] text-dark-500">Session: {activationToken.slice(0, 10)}...</p>
                  )}

                  {paymentInfo?.paymentRequired && (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left">
                      <p className="text-xs font-semibold text-amber-200">To enable live trading, complete subscription.</p>
                      <p className="mt-1 text-[11px] text-amber-100/90">
                        Pay {formatUSD(paymentInfo.amount)} {paymentInfo.currency} to:
                      </p>
                      <p className="mt-1 break-all rounded border border-dark-600 bg-dark-900 px-2 py-1 text-[11px] text-dark-200">
                        {paymentInfo.address ?? 'Set USDC_PAYMENT_ADDRESS on backend'}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void copyPaymentAddress()}
                          disabled={!paymentInfo.address}
                          className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-60"
                        >
                          {paymentCopied ? 'Copied' : 'Pay with USDC'}
                        </button>
                        <button
                          type="button"
                          disabled
                          className="rounded-md border border-dark-600 bg-dark-800 px-2 py-1.5 text-[11px] font-semibold text-dark-300"
                        >
                          Stripe (coming soon)
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-dark-400">
                        Bot activates within ~10 minutes after payment confirmation.
                      </p>
                    </div>
                  )}

                  {!paymentInfo?.paymentRequired && activationBotActive && (
                    <p className="mt-2 text-[11px] text-green-300">Live trading is active.</p>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 text-xs font-semibold text-dark-200 transition hover:bg-dark-700"
                    >
                      Stay Here
                    </button>
                    <Link
                      href="/wallet"
                      className="rounded-lg bg-cyan-500 px-3 py-2 text-center text-xs font-semibold text-dark-950 transition hover:bg-cyan-400"
                    >
                      Open Wallet
                    </Link>
                  </div>
                  {isConnected && (
                    <button
                      type="button"
                      onClick={() => disconnect()}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-dark-400 hover:text-dark-200"
                    >
                      <Wallet className="h-3 w-3" />
                      Disconnect wallet
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
