'use client';

import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { FileText } from 'lucide-react';

export default function TermsPage() {
  return (
    <DashboardLayout currentPath="/terms">
      <div className="glass-card p-8 max-w-3xl">
        <FileText className="w-12 h-12 mb-4 text-purple-400" />
        <h1 className="text-2xl font-bold mb-4">Terms of Service</h1>
        <p className="text-dark-400 mb-4">
          ArbiMind provides automated arbitrage detection and execution services. By using this platform, you agree to use it responsibly and in compliance with applicable laws.
        </p>
        <p className="text-dark-500 text-sm">Last updated: {new Date().toLocaleDateString()}</p>
      </div>
    </DashboardLayout>
  );
}
