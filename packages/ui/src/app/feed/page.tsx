
'use client';
export const dynamic = 'force-dynamic';

import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { Activity } from 'lucide-react';

export default function FeedPage() {
  return (
    <DashboardLayout currentPath="/feed">
      <div className="glass-card p-8 text-center">
        <Activity className="w-16 h-16 mx-auto mb-4 text-purple-400" />
        <h1 className="text-2xl font-bold mb-2">Arbitrage Feed</h1>
        <p className="text-dark-400">Coming soon. Real-time arb opportunities will appear here.</p>
      </div>
    </DashboardLayout>
  );
}
