'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Github as GithubIcon } from 'lucide-react';

const GITHUB_URL = 'https://github.com/rigocrypto/arbimind';

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
    <footer className="border-t border-white/10 bg-black/20 relative z-20">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-dark-400">
            © {new Date().getFullYear()} ArbiMind
          </div>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm" aria-label="Footer">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1.5 text-dark-400 hover:text-white transition-colors"
              aria-label="ArbiMind on GitHub"
            >
              <GithubIcon className="w-4 h-4" aria-hidden />
              GitHub
            </a>
            <FooterLink href="/docs">Docs</FooterLink>
            <FooterLink href="/terms" exact>Terms</FooterLink>
            <FooterLink href="/privacy" exact>Privacy</FooterLink>
          </nav>
        </div>
      </div>
    </footer>
  );
}

