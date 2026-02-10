'use client';

import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { BookOpen, Code, Zap, Shield, TrendingUp, Settings, ExternalLink, Github, Lock as LockIcon } from 'lucide-react';
import Link from 'next/link';

export default function DocsPage() {
  const sections = [
    {
      icon: Zap,
      title: 'Quick Start',
      description: 'Get up and running with ArbiMind in minutes',
      color: 'cyan',
      items: [
        { title: 'Installation Guide', href: '/docs/quickstart/installation' },
        { title: 'Configuration', href: '/docs/quickstart/configuration' },
        { title: 'First Trade', href: '/docs/quickstart/first-trade' },
      ],
    },
    {
      icon: TrendingUp,
      title: 'Trading Strategies',
      description: 'Learn about different arbitrage strategies',
      color: 'purple',
      items: [
        { title: 'Arbitrage V2/V3', href: '/docs/strategies/arbitrage-v2-v3' },
        { title: 'Market Making', href: '/docs/strategies/market-making' },
        { title: 'Trend Following', href: '/docs/strategies/trend-following' },
      ],
    },
    {
      icon: Shield,
      title: 'Risk Management',
      description: 'Protect your capital with proper risk controls',
      color: 'green',
      items: [
        { title: 'Position Sizing', href: '/docs/risk/position-sizing' },
        { title: 'Stop Loss', href: '/docs/risk/stop-loss' },
        { title: 'Risk Parameters', href: '/docs/risk/risk-parameters' },
      ],
    },
    {
      icon: LockIcon,
      title: 'Admin',
      description: 'Admin dashboard setup and access',
      color: 'amber',
      items: [
        { title: 'Admin Setup', href: '/docs/admin/setup' },
      ],
    },
    {
      icon: Code,
      title: 'API Reference',
      description: 'Integrate ArbiMind into your applications',
      color: 'orange',
      items: [
        { title: 'REST API', href: '/docs/api/rest' },
        { title: 'WebSocket', href: '/docs/api/websocket' },
        { title: 'Authentication', href: '/docs/api/authentication' },
      ],
    },
    {
      icon: Settings,
      title: 'Configuration',
      description: 'Customize your ArbiMind setup',
      color: 'pink',
      items: [
        { title: 'Environment Variables', href: '/docs/config/environment-variables' },
        { title: 'Strategy Settings', href: '/docs/config/strategy-settings' },
        { title: 'Gas Optimization', href: '/docs/config/gas-optimization' },
      ],
    },
  ];

  return (
    <DashboardLayout currentPath="/docs">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="glass-card p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold mb-2 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Documentation
              </h1>
              <p className="text-dark-300 text-sm sm:text-base">
                Complete guide to using ArbiMind for on-chain arbitrage trading.
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href="https://github.com/arbimind"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 border border-dark-700 text-white hover:bg-dark-700 transition"
              >
                <Github className="w-4 h-4" />
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </div>

        {/* Getting Started */}
        <div className="glass-card p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">Getting Started</h2>
          </div>
          <p className="text-dark-300 mb-4">
            ArbiMind is a professional MEV/searcher system for detecting and executing arbitrage opportunities
            across multiple DEXes. Get started by following these steps:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-dark-300">
            <li>Connect your wallet using the wallet connect button in the header</li>
            <li>Configure your trading preferences in Settings</li>
            <li>Create and activate your first trading strategy</li>
            <li>Monitor your trades in the Dashboard and History pages</li>
          </ol>
        </div>

        {/* Documentation Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.title}
                className="glass-card p-4 sm:p-6 hover:border-cyan-500/50 transition"
              >
                <div className={`w-12 h-12 rounded-lg bg-${section.color}-500/20 flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 text-${section.color}-400`} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{section.title}</h3>
                <p className="text-sm text-dark-400 mb-4">{section.description}</p>
                <ul className="space-y-2">
                  {section.items.map((item) => (
                    <li key={item.title}>
                      <Link
                        href={item.href}
                        className="text-sm text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1"
                      >
                        {item.title}
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Key Concepts */}
        <div className="glass-card p-4 sm:p-6">
          <h2 className="text-xl font-bold text-white mb-4">Key Concepts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: 'Arbitrage Trading', href: '/docs/concepts/arbitrage-trading' },
              { title: 'Slippage', href: '/docs/concepts/slippage' },
              { title: 'Gas & Fees', href: '/docs/concepts/gas-fees' },
              { title: 'MEV', href: '/docs/concepts/mev' },
              { title: 'Non-Custodial Signing', href: '/docs/concepts/non-custodial-signing' },
              { title: 'Fee Model', href: '/docs/concepts/fee-model' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="p-4 rounded-lg bg-dark-800/50 border border-dark-700 hover:border-cyan-500/50 transition flex items-center justify-between group"
              >
                <span className="font-semibold text-white group-hover:text-cyan-400 transition">{item.title}</span>
                <ExternalLink className="w-4 h-4 text-dark-500 group-hover:text-cyan-400 transition" />
              </Link>
            ))}
          </div>
        </div>

        {/* Support */}
        <div className="glass-card p-4 sm:p-6">
          <h2 className="text-xl font-bold text-white mb-4">Need Help?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              href="https://github.com/arbimind/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-lg bg-dark-800/50 border border-dark-700 hover:border-cyan-500/50 transition flex items-center gap-3"
            >
              <Github className="w-5 h-5 text-cyan-400" />
              <div>
                <div className="font-semibold text-white">GitHub Issues</div>
                <div className="text-xs text-dark-400">Report bugs and request features</div>
              </div>
            </a>
            <a
              href="https://discord.gg/arbimind"
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-lg bg-dark-800/50 border border-dark-700 hover:border-cyan-500/50 transition flex items-center gap-3"
            >
              <ExternalLink className="w-5 h-5 text-purple-400" />
              <div>
                <div className="font-semibold text-white">Discord Community</div>
                <div className="text-xs text-dark-400">Join our community for support</div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

