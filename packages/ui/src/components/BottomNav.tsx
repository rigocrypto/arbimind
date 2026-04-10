'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Zap, BarChart2, Wallet, Globe } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',              label: 'Home',     icon: Home      },
  { href: '/feed',          label: 'Feed',     icon: Zap       },
  { href: '/strategies',    label: 'Strategy', icon: BarChart2 },
  { href: '/wallet',        label: 'EVM',      icon: Wallet    },
  { href: '/solana-wallet', label: 'Solana',   icon: Globe     },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 sm:hidden border-t border-white/10 bg-black/80 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Mobile navigation"
    >
      <ul className="flex h-14 items-center justify-around px-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-colors ${
                  active ? 'text-cyan-400' : 'text-white/50 hover:text-white/80'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.8} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
