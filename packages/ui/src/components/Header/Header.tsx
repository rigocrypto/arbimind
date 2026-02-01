"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Search, Power, Menu } from 'lucide-react';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';

interface HeaderProps {
  isRunning?: boolean;
  onToggle?: () => void;
  onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isRunning = false,
  onToggle,
  onMenuClick,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-dark-900/80 backdrop-blur-md border-b border-dark-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Logo & Branding */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-400 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">Ⓐ</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-bold text-white">ArbiMind</div>
              <div className="text-xs text-dark-400">On-Chain Arbitrage</div>
            </div>
          </Link>

          {/* Center: Search */}
          <div className="hidden md:flex flex-1 max-w-sm mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                id="header-search"
                name="search"
                type="text"
                placeholder="Search opportunities..."
                className="w-full bg-dark-800 border border-dark-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-dark-500 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>
          </div>

          {/* Right: Engine Toggle, Wallet, Menu */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Status Indicator */}
            <motion.div
              className={`hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border transition ${
                isRunning
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-dark-700 bg-dark-800'
              }`}
            >
              <motion.div
                animate={isRunning ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                transition={{ repeat: isRunning ? Infinity : 0, duration: 2 }}
                className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-400' : 'bg-dark-500'}`}
              />
              <span className="text-xs font-medium text-dark-300">
                {isRunning ? 'Running' : 'Idle'}
              </span>
            </motion.div>

            {/* Engine Toggle */}
            <button
              onClick={onToggle}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition border ${
                isRunning
                  ? 'bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30'
                  : 'bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30'
              }`}
              aria-label={isRunning ? 'Stop engine' : 'Start engine'}
            >
              <Power className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">
                {isRunning ? 'Stop' : 'Start'}
              </span>
            </button>

            {/* Wallet Connect Button from RainbowKit */}
            <div className="hidden sm:block">
              <ConnectButton 
                label="Connect Wallet"
                accountStatus="address"
                chainStatus="icon"
                showBalance={{
                  smallScreen: false,
                  largeScreen: true,
                }}
              />
            </div>
            
            {/* Mobile Wallet Button */}
            <div className="sm:hidden">
              <ConnectButton 
                label="Connect"
                accountStatus="avatar"
                chainStatus="icon"
              />
            </div>

            {/* Mobile Menu */}
            <button
              onClick={onMenuClick}
              className="md:hidden p-2 rounded-lg border border-dark-700 hover:bg-dark-800 transition"
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

