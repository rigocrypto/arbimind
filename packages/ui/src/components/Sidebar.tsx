'use client';

import Link from 'next/link';
import { 
  LayoutDashboard, 
  Brain, 
  TrendingUp, 
  History, 
  Settings, 
  Wallet, 
  BookOpen,
  X
} from 'lucide-react';

interface SidebarProps {
  currentPath?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ currentPath = '/', isOpen = false, onClose }: SidebarProps) {
  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: Brain, label: 'AI Strategies', path: '/strategies' },
    { icon: TrendingUp, label: 'Arbitrage Feed', path: '/feed' },
    { icon: History, label: 'Trading History', path: '/history' },
    { icon: Wallet, label: 'Wallet', path: '/wallet' },
    { icon: Settings, label: 'Settings', path: '/settings' },
    { icon: BookOpen, label: 'Docs', path: '/docs' },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 h-screen bg-gradient-to-b from-dark-900 via-dark-800 to-dark-900 border-r border-cyan-500/20 flex-shrink-0">
        {/* Header */}
        <div className="p-6 border-b border-cyan-500/10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/50">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                ArbiMind
              </h2>
              <p className="text-xs text-dark-400">v1.0.0</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.path;
            
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`
                  flex items-center space-x-3 px-4 py-3 rounded-lg
                  transition-all duration-200 group
                  ${isActive 
                    ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-400' 
                    : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
                  }
                `}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-cyan-400' : 'text-dark-400 group-hover:text-cyan-400'}`} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-cyan-500/10">
          <div className="text-xs text-dark-500 text-center">
            © 2025 ArbiMind
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <aside className={`
        lg:hidden fixed top-0 left-0 z-50 h-full w-64 bg-gradient-to-b from-dark-900 via-dark-800 to-dark-900 border-r border-cyan-500/20
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Mobile Header */}
        <div className="p-6 border-b border-cyan-500/10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/50">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                ArbiMind
              </h2>
              <p className="text-xs text-dark-400">v1.0.0</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-700 transition-colors"
            aria-label="Close menu"
            type="button"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Mobile Navigation */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.path;
            
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={onClose}
                className={`
                  flex items-center space-x-3 px-4 py-3 rounded-lg
                  transition-all duration-200 group
                  ${isActive 
                    ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 text-cyan-400' 
                    : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
                  }
                `}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-cyan-400' : 'text-dark-400 group-hover:text-cyan-400'}`} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile Footer */}
        <div className="p-4 border-t border-cyan-500/10">
          <div className="text-xs text-dark-500 text-center">
            © 2025 ArbiMind
          </div>
        </div>
      </aside>
    </>
  );
}
