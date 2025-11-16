'use client';

import { Brain, Power, Wallet, Activity } from 'lucide-react';

interface DashboardHeaderProps {
  isRunning: boolean;
  onToggle: () => void;
  onConnectWallet?: () => void;
  walletConnected?: boolean;
}

export function DashboardHeader({ isRunning, onToggle, onConnectWallet, walletConnected }: DashboardHeaderProps) {
  return (
    <header className="relative overflow-hidden bg-gradient-to-r from-dark-900 via-dark-800 to-dark-900 border-b border-cyan-500/20 z-30">
      {/* Animated background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,246,255,0.1),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(0,246,255,0.05)_50%,transparent_75%)] bg-[length:20px_20px]" />
      </div>

      <div className="relative z-10 backdrop-blur-sm bg-dark-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo & Title */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/50 animate-pulse-slow">
                  <Brain className="w-8 h-8 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-dark-900 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  ArbiMind
                </h1>
                <p className="text-sm text-dark-400">The AI brain of decentralized arbitrage</p>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center space-x-4">
              {/* System Status */}
              <div className="hidden md:flex items-center space-x-3 px-4 py-2 rounded-lg bg-dark-700/50 border border-cyan-500/20">
                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm font-medium text-white">
                  {isRunning ? 'System Active' : 'System Stopped'}
                </span>
              </div>

              {/* Wallet Button */}
              {onConnectWallet && (
                <button
                  onClick={onConnectWallet}
                  type="button"
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-white hover:from-purple-500/30 hover:to-pink-500/30 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  <Wallet className="w-4 h-4" />
                  <span className="text-sm font-medium">{walletConnected ? 'Disconnect' : 'Connect Wallet'}</span>
                </button>
              )}

              {/* Power Toggle */}
              <button
                onClick={onToggle}
                type="button"
                className={`
                  flex items-center space-x-2 px-6 py-2.5 rounded-lg font-medium
                  transition-all duration-200 shadow-lg cursor-pointer
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-900
                  ${isRunning
                    ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white focus:ring-red-500/50'
                    : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white focus:ring-green-500/50'
                  }
                `}
              >
                <Power className={`w-4 h-4 ${isRunning ? 'animate-pulse' : ''}`} />
                <span>{isRunning ? 'Stop Engine' : 'Start Engine'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

