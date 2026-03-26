
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { usePathname, useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Menu, Wallet2, X } from 'lucide-react';
import { NAV_ITEMS } from '@/config/nav';
import { getPersistentCtaVariant, trackEvent } from '@/lib/analytics';
import { WALLET_STATE_UPDATED_EVENT } from '@/lib/walletState';

function truncateAddress(address?: string | null): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function readSolanaWalletAddress(): string | null {
  if (typeof window === 'undefined') return null;
  const connected = window.localStorage.getItem('arbimind:wallet:solanaConnected') === '1';
  const address = window.localStorage.getItem('arbimind:wallet:solanaAddress');
  return connected && address ? address : null;
}

function EthereumGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5">
      <path d="M12 2 6.5 12 12 9.2 17.5 12 12 2Z" fill="currentColor" />
      <path d="M12 10.8 6.5 13.5 12 22 17.5 13.5 12 10.8Z" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function SolanaGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5">
      <rect x="4" y="5" width="16" height="3" rx="1.5" fill="currentColor" opacity="0.95" />
      <rect x="4" y="10.5" width="16" height="3" rx="1.5" fill="currentColor" opacity="0.8" />
      <rect x="4" y="16" width="16" height="3" rx="1.5" fill="currentColor" opacity="0.65" />
    </svg>
  );
}

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { isConnected, address } = useAccount();
  const ctaVariant = useMemo(() => getPersistentCtaVariant(), []);
  const wasConnectedRef = useRef(isConnected);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(() => readSolanaWalletAddress());
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [logoVideoReady, setLogoVideoReady] = useState(false);

  useEffect(() => {
    const sync = () => setSolanaAddress(readSolanaWalletAddress());
    window.addEventListener(WALLET_STATE_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);

    return () => {
      window.removeEventListener(WALLET_STATE_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPrefersReducedMotion(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener('change', sync);

    return () => {
      mediaQuery.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    if (!wasConnectedRef.current && isConnected) {
      trackEvent('wallet_connected', {
        source: 'header_connect_button',
        ctaVariant,
      });
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected, ctaVariant]);

  const ctaLabel = ctaVariant === 'A' ? 'Start in 60s' : 'Unlock live opportunities';
  const solanaConnected = Boolean(solanaAddress);
  const evmLabel = isConnected ? truncateAddress(address) : 'EVM Wallet';
  const solLabel = solanaConnected ? truncateAddress(solanaAddress) : 'Solana Wallet';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-white/10 bg-[#070d1b]/95 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#00e5cc]/50 to-transparent" />
      <div className="h-full max-w-[1440px] mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative h-8 w-8 overflow-hidden rounded-lg ring-1 ring-white/15">
              <Image
                src="/favicon.svg"
                alt="ArbiMind logo"
                fill
                sizes="32px"
                className="object-cover"
                priority
              />
              {!prefersReducedMotion && (
                <video
                  src="/favicon.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedData={() => setLogoVideoReady(true)}
                  onError={() => setLogoVideoReady(false)}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
                    logoVideoReady ? 'opacity-100' : 'opacity-0'
                  }`}
                  aria-label="Animated ArbiMind logo"
                />
              )}
            </div>
            <span className="text-white font-semibold text-lg hidden sm:block">ArbiMind</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1.5 text-[14px] font-medium tracking-[-0.01em] transition-all duration-150 ${
                  isActivePath(pathname, item.href)
                    ? 'bg-[#00e5cc] text-[#041018] shadow-[0_0_0_1px_rgba(0,229,204,0.3)]'
                    : 'text-white/65 hover:bg-white/8 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-3">
          {!isConnected && (
            <span className="hidden md:block text-xs text-cyan-300/90">{ctaLabel}</span>
          )}

          <ConnectButton.Custom>
            {({ account, mounted, openAccountModal, openConnectModal }) => {
              const ready = mounted;
              const connected = ready && !!account;

              return (
                <button
                  type="button"
                  onClick={() => {
                    if (!connected) {
                      trackEvent('wallet_connect_click', {
                        source: 'header_evm_wallet_button',
                        ctaVariant,
                        pathname,
                      });
                      openConnectModal?.();
                      return;
                    }
                    openAccountModal?.();
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#00e5cc]/60 bg-transparent px-3.5 text-[13px] font-medium text-[#7ff6e7] transition-all duration-150 hover:bg-[#00e5cc]/10"
                >
                  <EthereumGlyph />
                  {connected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                  <span>{connected ? truncateAddress(account.address) : evmLabel}</span>
                </button>
              );
            }}
          </ConnectButton.Custom>

          <button
            type="button"
            onClick={() => {
              router.push('/solana-wallet');
            }}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-[#00e5cc] to-[#7c4dff] px-3.5 text-[13px] font-medium text-white transition-all duration-150 hover:brightness-110"
          >
            <SolanaGlyph />
            {solanaConnected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />}
            <span>{solLabel}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => {
              setIsWalletModalOpen(true);
              setIsMobileNavOpen(false);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white/85 transition-all duration-150 hover:bg-white/10"
            aria-label="Open wallet connections"
          >
            <Wallet2 className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setIsMobileNavOpen((prev) => !prev);
              setIsWalletModalOpen(false);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white/85 transition-all duration-150 hover:bg-white/10"
            aria-label="Toggle navigation menu"
          >
            {isMobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {isMobileNavOpen && (
        <div className="border-t border-white/10 bg-[#070d1b]/95 px-3 py-3 md:hidden">
          <nav className="grid grid-cols-2 gap-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileNavOpen(false)}
                className={`rounded-lg px-3 py-2 text-[13px] font-medium tracking-[-0.01em] transition-all duration-150 ${
                  isActivePath(pathname, item.href)
                    ? 'bg-[#00e5cc] text-[#041018]'
                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {isWalletModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-start justify-end bg-black/55 p-3 pt-20 md:hidden">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close wallet modal"
            onClick={() => setIsWalletModalOpen(false)}
          />
          <div className="relative w-full max-w-xs rounded-xl border border-white/15 bg-[#0a1224] p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-white/60">Connect wallet</p>
              <button
                type="button"
                onClick={() => setIsWalletModalOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ConnectButton.Custom>
              {({ account, mounted, openAccountModal, openConnectModal }) => {
                const ready = mounted;
                const connected = ready && !!account;

                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (!connected) {
                        trackEvent('wallet_connect_click', {
                          source: 'header_mobile_wallet_modal_evm_button',
                          ctaVariant,
                          pathname,
                        });
                        openConnectModal?.();
                        setIsWalletModalOpen(false);
                        return;
                      }
                      openAccountModal?.();
                      setIsWalletModalOpen(false);
                    }}
                    className="mb-2 inline-flex h-9 w-full items-center gap-2 rounded-lg border border-[#00e5cc]/60 bg-transparent px-3.5 text-[13px] font-medium text-[#7ff6e7] transition-all duration-150 hover:bg-[#00e5cc]/10"
                  >
                    <EthereumGlyph />
                    {connected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                    <span>{connected ? truncateAddress(account.address) : evmLabel}</span>
                  </button>
                );
              }}
            </ConnectButton.Custom>

            <button
              type="button"
              onClick={() => {
                setIsWalletModalOpen(false);
                router.push('/solana-wallet');
              }}
              className="inline-flex h-9 w-full items-center gap-2 rounded-lg bg-gradient-to-r from-[#00e5cc] to-[#7c4dff] px-3.5 text-[13px] font-medium text-white transition-all duration-150 hover:brightness-110"
            >
              <SolanaGlyph />
              {solanaConnected && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />}
              <span>{solLabel}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

