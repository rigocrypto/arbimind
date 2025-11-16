'use client';

import Link from 'next/link';
import { Github, Twitter, BookOpen, MessageCircle } from 'lucide-react';

export function Footer() {
  const links = [
    { icon: BookOpen, label: 'Docs', href: '/docs' },
    { icon: Github, label: 'GitHub', href: 'https://github.com' },
    { icon: Twitter, label: 'Twitter', href: 'https://twitter.com' },
    { icon: MessageCircle, label: 'Discord', href: 'https://discord.com' },
  ];

  return (
    <footer className="border-t border-purple-500/20 bg-dark-900/80 backdrop-blur-sm relative z-20">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-8 sm:py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
          <div className="text-center md:text-left">
            <h3 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-purple-400 to-teal-400 bg-clip-text text-transparent mb-2">
              ArbiMind
            </h3>
            <p className="text-dark-400 text-xs sm:text-sm">
              © {new Date().getFullYear()} ArbiMind. Version 1.0.0
            </p>
          </div>

          <div className="flex items-center flex-wrap justify-center gap-4 sm:gap-6">
            <Link
              href="https://github.com"
              className="flex items-center gap-1.5 sm:gap-2 text-dark-400 hover:text-purple-400 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm">GitHub</span>
            </Link>
            <Link
              href="/terms"
              className="text-xs sm:text-sm text-dark-400 hover:text-purple-400 transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-xs sm:text-sm text-dark-400 hover:text-purple-400 transition-colors"
            >
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

