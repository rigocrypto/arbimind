"use client";

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount, useDisconnect } from 'wagmi';
import { NAV_ITEMS } from '@/config/nav';

export function Header() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : '';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-white/10 bg-[#0a0f1e]/95 backdrop-blur-md">
      <div className="h-full max-w-[1440px] mx-auto px-4 flex items-center justify-between">
        {/* LEFT: Logo + App Name */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
            A
          </div>
          <span className="text-white font-semibold text-lg hidden sm:block">
            ArbiMind
          </span>
        </Link>
        {/* CENTER: Dropdown Nav (desktop) */}
        <div className="relative hidden md:block" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Navigate
            <svg className={`w-3 h-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute top-full left-0 mt-2 w-56 rounded-xl border border-white/10 bg-[#0b1220] shadow-2xl overflow-hidden">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={[
                      'block px-4 py-3 text-sm transition border-b border-white/5 last:border-0',
                      active
                        ? 'bg-cyan-500/10 text-cyan-400'
                        : 'text-white/70 hover:bg-white/5 hover:text-white',
                    ].join(' ')}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        {/* RIGHT: Status + Pro + Wallet */}
        <div className="flex items-center gap-3">
          {/* Pro badge */}
          <Link
            href="/pro"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 text-yellow-400 text-xs font-medium hover:border-yellow-500/50 transition"
          >
            ⚡ Pro $9/mo
          </Link>
          {/* Engine status */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white/60">Stopped</span>
          </div>
          {/* Wallet */}
          {isConnected ? (
            <button
              onClick={() => disconnect()}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm hover:bg-cyan-500/20 transition"
            >
              {shortAddress}
            </button>
          ) : (
            <button
              onClick={() => {
                // open your wallet modal here
                // e.g. open() from useWeb3Modal
              }}
              className="px-4 py-1.5 rounded-lg bg-cyan-500 text-white text-sm font-medium hover:bg-cyan-600 transition"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

