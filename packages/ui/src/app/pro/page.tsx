'use client';

import Link from 'next/link';
import { DashboardLayout } from '@/components/Layout/DashboardLayout';
import { Zap, Check } from 'lucide-react';

export default function ProPage() {
  const features = [
    '0.5% tx fee → Auto-bots',
    'Premium alerts',
    'Priority execution',
    'Discord support',
  ];

  return (
    <DashboardLayout currentPath="/pro">
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 mb-6">
          <Zap className="w-8 h-8 text-black" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Pro Plan</h1>
        <p className="text-dark-400 mb-8">Upgrade for auto-bots and premium features.</p>
        <div className="space-y-3 mb-8 text-left">
          {features.map((f) => (
            <div key={f} className="flex items-center gap-3 text-dark-300">
              <Check className="w-5 h-5 text-green-400 shrink-0" />
              <span>{f}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-dark-500 mb-6">$9/mo — Coming soon. Join waitlist.</p>
        <Link
          href="/wallet"
          className="inline-flex px-6 py-3 rounded-lg bg-dark-700 hover:bg-dark-600 text-white font-medium transition"
        >
          Back to Wallet
        </Link>
      </div>
    </DashboardLayout>
  );
}
