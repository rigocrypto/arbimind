'use client';

import Link from 'next/link';
import { Brain, Power, Menu, ChevronDown, Share2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
import { formatAddress } from '@/utils/format';
import { RevenueTooltip } from '@/components/RevenueTooltip';
import { useReferral } from '@/hooks/useReferral';
import { useHydrated } from '@/hooks/useHydrated';
import { ChainSwitcherModal } from '@/components/ChainSwitcherModal';

interface HeaderProps {
  isRunning: boolean;
  onToggle: () => void;
  onMenuClick?: () => void;
  currentPath?: string;
}

export function Header({ 
  isRunning, 
  onToggle, 
  onMenuClick,
  currentPath = '/',
}: HeaderProps) {
  const isSolanaPage = currentPath === '/solana-wallet';
  const proVariant = (process.env.NEXT_PUBLIC_PRO_VARIANT || 'header-center') as 'header-center' | 'off';
  const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);
  const [chainSwitcherOpen, setChainSwitcherOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { earnings, copyRefLink } = useReferral();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setWalletDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

          {/* Center: Pro banner */}
          {proVariant === 'header-center' && (
            <div className="hidden lg:flex flex-1 items-center justify-center px-4">
              <Link
                href="/pro"
                className="flex w-full max-w-[520px] items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500/20 to-blue-500/20 border border-amber-400/40 hover:from-emerald-500/30 hover:to-blue-500/30 transition-all text-sm"
              >
                <div className="min-w-0">
                  <span className="font-bold text-white">Pro Arbitrage Unlocked</span>
                  <span className="hidden sm:inline text-dark-300 text-xs ml-2">0.5% tx fee → Auto-bots + premium alerts</span>
                </div>
                <span className="shrink-0 bg-amber-300 text-black px-3 py-1 rounded-lg font-bold text-xs hover:bg-amber-200 transition-colors">
                  Get Pro $9/mo
                </span>
              </Link>
            </div>
          )}

          {/* Right: Controls */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 lg:space-x-3 flex-shrink-0 min-w-0">
            {/* System Status - Icon only on mobile */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-3 py-1.5 rounded-lg bg-dark-700/50 border border-cyan-500/20">
              <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-xs sm:text-sm font-medium text-white hidden sm:inline">
                {isRunning ? 'Active' : 'Stopped'}
              </span>
            </div>

            {/* Wallet - on Solana page: show EVM link only. Else: EVM RainbowKit */}
            <div className="flex-shrink-0" ref={dropdownRef}>
              {isSolanaPage ? (
                <Link
                  href="/wallet"
                  className="flex items-center gap-2 p-2 sm:px-4 sm:py-2 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-dark-300 hover:text-white transition-all text-sm font-medium"
                >
                  EVM Wallet →
                </Link>
              ) : !hydrated ? (
                <div className="h-9 w-24 sm:w-32 rounded-lg bg-dark-700/50 animate-pulse" aria-hidden />
              ) : (
              <ConnectButton.Custom>
                {({
                  account,
                  chain,
                  openAccountModal,
                  openChainModal,
                  openConnectModal,
                  mounted,
                }) => {
                  if (!mounted) {
                    return (
                      <div
                        className="h-9 w-24 sm:w-32 rounded-lg bg-dark-700/50 animate-pulse"
                        aria-hidden
                      />
                    );
                  }
                  const connected = account && chain;
                  if (!connected) {
                    return (
                      <button
                        type="button"
                        onClick={openConnectModal}
                        className="flex items-center justify-center sm:space-x-2 p-2 sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-white hover:from-purple-500/30 hover:to-pink-500/30 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm font-medium"
                      >
                        Connect Wallet
                      </button>
                    );
                  }
                  if (chain.unsupported) {
                    return (
                      <button
                        type="button"
                        onClick={() => setChainSwitcherOpen(true)}
                        className="flex items-center justify-center p-2 sm:px-4 sm:py-2 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-all"
                      >
                        Wrong network
                      </button>
                    );
                  }
                  return (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setWalletDropdownOpen(!walletDropdownOpen)}
                        className="flex items-center justify-center sm:space-x-2 p-2 sm:px-3 sm:py-2 rounded-lg bg-dark-700/50 hover:bg-dark-600 border border-dark-600 text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-sm font-medium"
                      >
                        <span className="hidden sm:inline">
                          {account.address ? formatAddress(account.address, 6, 4) : ''}
                        </span>
                        <span className="sm:hidden">
                          {account.address ? `${account.address.slice(0, 6)}...` : ''}
                        </span>
                        <ChevronDown className="w-4 h-4 opacity-70" />
                      </button>
                      {walletDropdownOpen && (
                        <div className="absolute right-0 top-full mt-1 py-1 rounded-lg bg-dark-800 border border-dark-600 shadow-xl z-[9999] min-w-[160px]">
                          <button
                            type="button"
                            onClick={() => { copyRefLink(); setWalletDropdownOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-dark-200 hover:bg-dark-700 transition-colors flex items-center gap-2"
                          >
                            <Share2 className="w-4 h-4" />
                            Copy Referral Link
                          </button>
                          <button
                            type="button"
                            onClick={() => { setChainSwitcherOpen(true); setWalletDropdownOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-dark-200 hover:bg-dark-700 transition-colors"
                          >
                            Switch Network
                          </button>
                          <button
                            type="button"
                            onClick={() => { openAccountModal(); setWalletDropdownOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-dark-200 hover:bg-dark-700 transition-colors"
                          >
                            Account
                          </button>
                          <button
                            type="button"
                            onClick={() => { disconnect(); setWalletDropdownOpen(false); }}
                            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors font-medium"
                          >
                            Disconnect
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }}
              </ConnectButton.Custom>
              )}
            </div>

            <ChainSwitcherModal
              isOpen={chainSwitcherOpen}
              onClose={() => setChainSwitcherOpen(false)}
            />

            {/* Share & Earn - when connected (EVM only, hide on Solana page) */}
            {isConnected && !isSolanaPage && (
              <button
                type="button"
                onClick={copyRefLink}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 text-xs font-medium transition-colors"
                title="Copy referral link"
              >
                <Share2 className="w-4 h-4" />
                <span>Share & Earn {earnings.toFixed(2)} ETH</span>
              </button>
            )}

            {/* Revenue info tooltip */}
            <RevenueTooltip />

            {/* Engine Toggle - disabled when wallet not connected */}
            <button
              onClick={isConnected ? onToggle : undefined}
              type="button"
              disabled={!isConnected}
              title={!isConnected ? 'Connect wallet first' : undefined}
              className={`
                flex items-center justify-center sm:space-x-2 p-2 sm:px-4 sm:py-2 rounded-lg font-medium text-sm
                transition-all duration-200 shadow-lg
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-800
                ${!isConnected
                  ? 'bg-dark-700 text-dark-400 cursor-not-allowed opacity-60'
                  : isRunning
                    ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white focus:ring-red-500/50 cursor-pointer'
                    : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white focus:ring-green-500/50 cursor-pointer'
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

