'use client';

import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { Shield } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <DashboardLayout currentPath="/privacy">
      <div className="glass-card p-8 max-w-3xl">
        <Shield className="w-12 h-12 mb-4 text-purple-400" />
        <h1 className="text-2xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-dark-400 mb-4">
          ArbiMind does not store your private keys. Wallet connections are handled client-side via WalletConnect. We may collect anonymized usage data to improve the service.
        </p>
        <p className="text-dark-500 text-sm">Last updated: {new Date().toLocaleDateString()}</p>
      </div>
    </DashboardLayout>
  );
}
