'use client';

import { Brain, Power, Wallet, Search, Menu } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
  isRunning: boolean;
  onToggle: () => void;
  onConnectWallet?: () => void;
  walletConnected?: boolean;
  onMenuClick?: () => void;
}

export function Header({ 
  isRunning, 
  onToggle, 
  onConnectWallet, 
  walletConnected,
  onMenuClick 
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="sticky top-0 z-30 bg-dark-800/95 backdrop-blur-sm border-b border-cyan-500/20">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Left: Logo & Menu */}
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
            <button
              onClick={onMenuClick}
              className="lg:hidden p-2 rounded-lg hover:bg-dark-700 transition-colors flex-shrink-0"
              aria-label="Toggle menu"
              type="button"
            >
              <Menu className="w-5 h-5 text-white" />
            </button>
            
            <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/50 flex-shrink-0">
                <Brain className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="hidden xs:block min-w-0">
                <h1 className="text-base sm:text-lg font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent truncate">
                  ArbiMind
                </h1>
                <p className="text-xs text-dark-400 hidden sm:block">The Brain of On-Chain Arbitrage</p>
              </div>
            </div>
          </div>

          {/* Center: Search - Hidden on mobile */}
          <div className="hidden md:flex flex-1 max-w-md mx-4 lg:mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-dark-400" />
              <input
                type="text"
                placeholder="Search strategies, opportunities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 text-sm"
              />
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 lg:space-x-3 flex-shrink-0">
            {/* System Status - Icon only on mobile */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-3 py-1.5 rounded-lg bg-dark-700/50 border border-cyan-500/20">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-xs sm:text-sm font-medium text-white hidden sm:inline">
                {isRunning ? 'Active' : 'Stopped'}
              </span>
            </div>

            {/* Wallet Button - Icon only on mobile */}
            {onConnectWallet && (
              <button
                onClick={onConnectWallet}
                type="button"
                className="flex items-center justify-center sm:space-x-2 p-2 sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-white hover:from-purple-500/30 hover:to-pink-500/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                <Wallet className="w-4 h-4" />
                <span className="hidden sm:inline text-sm font-medium">
                  {walletConnected ? 'Disconnect' : 'Connect'}
                </span>
              </button>
            )}

            {/* Engine Toggle - Icon only on mobile */}
            <button
              onClick={onToggle}
              type="button"
              className={`
                flex items-center justify-center sm:space-x-2 p-2 sm:px-4 sm:py-2 rounded-lg font-medium text-sm
                transition-all duration-200 shadow-lg
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-800
                ${isRunning
                  ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white focus:ring-red-500/50'
                  : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white focus:ring-green-500/50'
                }
              `}
            >
              <Power className={`w-4 h-4 ${isRunning ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">{isRunning ? 'Stop' : 'Start'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

