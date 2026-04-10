'use client';

import type { ReactNode } from 'react';
import { BottomNav } from '@/components/BottomNav';

interface DashboardLayoutProps {
  children: ReactNode;
  currentPath?: string;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen">
      {children}
      <BottomNav />
    </div>
  );
}
