'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Github as GithubIcon, LifeBuoy, ShieldCheck } from 'lucide-react';

const GITHUB_URL = 'https://github.com/rigocrypto/arbimind';
const SUPPORT_URL = 'https://github.com/rigocrypto/arbimind/issues';

function FooterLink({
  href,
  children,
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
  return (
    <Link
      href={href}
      className={`transition-colors ${isActive ? 'text-white font-medium' : 'text-dark-400 hover:text-white'}`}
      aria-current={isActive ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="relative z-20 border-t border-white/10 bg-black/30 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold text-white">ArbiMind</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-dark-300">
                Live arbitrage intelligence for monitoring routes, connecting wallets, and operating faster across EVM and Solana flows.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-dark-300">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 transition-colors hover:text-white"
              >
                <GithubIcon className="h-4 w-4" aria-hidden />
                GitHub
              </a>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 transition-colors hover:text-white"
              >
                <LifeBuoy className="h-4 w-4" aria-hidden />
                Support
              </a>
            </div>
          </div>

          <nav className="space-y-3" aria-label="Product footer links">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Product</p>
            <div className="flex flex-col gap-2 text-sm">
              <FooterLink href="/settings" exact>Settings</FooterLink>
              <FooterLink href="/wallet" exact>EVM Wallet</FooterLink>
              <FooterLink href="/solana-wallet" exact>Solana Wallet</FooterLink>
              <FooterLink href="/history">History</FooterLink>
            </div>
          </nav>

          <nav className="space-y-3" aria-label="Resources footer links">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Resources</p>
            <div className="flex flex-col gap-2 text-sm">
              <FooterLink href="/docs">Docs</FooterLink>
              <FooterLink href="/feed">Live Feed</FooterLink>
              <FooterLink href="/strategies">Strategies</FooterLink>
              <FooterLink href="/pro">Pro Access</FooterLink>
            </div>
          </nav>

          <nav className="space-y-3" aria-label="Company footer links">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Trust</p>
            <div className="flex flex-col gap-2 text-sm">
              <FooterLink href="/terms" exact>Terms</FooterLink>
              <FooterLink href="/privacy" exact>Privacy</FooterLink>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 text-dark-400 transition-colors hover:text-white"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Report an issue
              </a>
            </div>
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-5 text-xs text-dark-400 sm:flex-row sm:items-center sm:justify-between">
          <div>© {new Date().getFullYear()} ArbiMind. Built for fast on-chain execution.</div>
          <div className="flex items-center gap-4">
            <span>Production status visible in nightly smoke monitoring.</span>
            <Link href="/docs" className="text-dark-300 transition-colors hover:text-white">
              Deployment docs
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

