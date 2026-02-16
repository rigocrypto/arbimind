
'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/config/nav';

export function Header() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-white/10 bg-[#0a0f1e]/95 backdrop-blur-md">
      <div className="h-full max-w-[1440px] mx-auto px-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-white font-bold">A</div>
            <span className="text-white font-semibold text-lg hidden sm:block">ArbiMind</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  pathname === item.href ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
        </div>
      </div>
    </header>
  );
}
// ...existing code ends here. Removed stray <Link> that caused syntax error.

