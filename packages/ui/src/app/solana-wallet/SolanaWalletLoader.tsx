'use client';

import dynamic from 'next/dynamic';

const SolanaWalletPageClient = dynamic(
  () => import('./SolanaWalletPageClient'),
  {
    ssr: false,
    loading: () => (
      <div data-testid="solana-wallet-loading" className="min-h-[400px] flex items-center justify-center bg-dark-900 p-6">
        <span className="text-sm text-dark-400 opacity-80">Loading Solana wallet…</span>
      </div>
    ),
  }
);

export default function SolanaWalletLoader() {
  return <SolanaWalletPageClient />;
}
