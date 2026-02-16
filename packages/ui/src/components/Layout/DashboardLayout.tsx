'use client';

import type { ReactNode } from 'react';

interface DashboardLayoutProps {
  children: ReactNode;
  currentPath?: string;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}
