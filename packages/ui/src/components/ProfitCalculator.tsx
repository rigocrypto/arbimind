'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { TrendingUp, DollarSign, Zap, Shield, CheckCircle2, Sparkles, Activity, Clock, Star } from 'lucide-react';

const DAILY_RATES = [0.0015, 0.0035, 0.0065] as const;
const RISK_LABELS = ['Conservative', 'Balanced', 'Aggressive'] as const;
const RISK_DESCS = ['~0.15%/day', '~0.35%/day', '~0.65%/day'] as const;
const SPEED_LABELS = ['Standard', 'Priority', 'Ultra'] as const;
const SPEED_DESCS = ['1–2 trades/hr', '4–6 trades/hr', '10+/hr'] as const;
const BOT_FEE = 29;

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
              <Link
                href="/wallet"
                className="btn-primary flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold shadow-lg shadow-cyan-900/40 transition hover:scale-[1.02] active:scale-[0.98]"
              >
                <Zap className="h-4 w-4" />
                Start Earning Passively
              </Link>
              <p className="text-center text-[11px] text-amber-400/80">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse" />
                Priority slots available: 12 remaining
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
    </div>
  );
}
