'use client';

import { useState, ReactNode } from 'react';
import { Sidebar } from '../Sidebar';
import { Header } from '../Header';
import { Footer } from '../Footer';
import { useEngineContext } from '@/contexts/EngineContext';

interface DashboardLayoutProps {
  children: ReactNode;
  currentPath?: string;
}

export function DashboardLayout({ children, currentPath = '/' }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isRunning, start, stop } = useEngineContext();

  const handleToggleEngine = () => {
    if (isRunning) {
      stop();
    } else {
      start();
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 text-white flex">
      {/* Sidebar */}
      <Sidebar 
        currentPath={currentPath}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header
          isRunning={isRunning}
          onToggle={handleToggleEngine}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-dark-900">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">
            {children}
          </div>
        </main>

        {/* Footer */}
        <Footer />
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
