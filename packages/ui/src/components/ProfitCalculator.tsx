'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { TrendingUp, DollarSign, Zap, Shield, CheckCircle2 } from 'lucide-react';

const DAILY_RATES = [0.0015, 0.0035, 0.0065] as const;
const RISK_LABELS = ['Conservative', 'Balanced', 'Aggressive'] as const;
const RISK_DESCS = ['~0.15%/day', '~0.35%/day', '~0.65%/day'] as const;
const SPEED_LABELS = ['Standard', 'Priority', 'Ultra'] as const;
const SPEED_DESCS = ['1–2 trades/hr', '4–6 trades/hr', '10+/hr'] as const;
const BOT_FEE = 29;

function formatUSD(val: number) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function ProfitCalculator() {
  const [capital, setCapital] = useState(1500);
  const [riskIndex, setRiskIndex] = useState<0 | 1 | 2>(1);
  const [speedIndex, setSpeedIndex] = useState<0 | 1 | 2>(1);

  const { monthlyProfit, netProfit, roi } = useMemo(() => {
    const monthly = capital * DAILY_RATES[riskIndex] * 30;
    const net = monthly - BOT_FEE;
    const r = (net / capital) * 100;
    return { monthlyProfit: monthly, netProfit: net, roi: r };
  }, [capital, riskIndex]);

  const bullets = [
    { icon: Zap, text: 'Bot runs 24/7 — no manual monitoring needed' },
    { icon: Shield, text: 'Funds stay in your wallet at all times' },
    { icon: CheckCircle2, text: 'Only profitable trades are executed' },
    { icon: TrendingUp, text: 'Performance fee applied only on gains' },
  ];

  return (
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
          <p className="text-xs sm:text-sm text-dark-400">Estimate your monthly returns with ArbiMind</p>
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
        <div className="flex flex-col justify-between gap-6">
          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-900/30 via-dark-900/60 to-purple-900/30 p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-dark-400 mb-4">
              Estimated Monthly Results
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-300">Gross Profit</span>
                <motion.span
                  key={monthlyProfit}
                  initial={{ opacity: 0.4, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className="text-base font-bold text-white"
                >
                  {formatUSD(monthlyProfit)}
                </motion.span>
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

          <Link
            href="/wallet"
            className="btn-primary flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold shadow-lg shadow-cyan-900/40 transition hover:scale-[1.02] active:scale-[0.98]"
          >
            <Zap className="h-4 w-4" />
            Start Auto Bot
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
