'use client';

import dynamic from 'next/dynamic';
import { Toaster } from 'react-hot-toast';
import { EngineProvider } from '@/contexts/EngineContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const WalletProvider = dynamic(
  () => import('@/providers/wallet-provider'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="animate-pulse text-dark-400 text-sm">Loading...</div>
      </div>
    ),
  }
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <WalletProvider>
        <EngineProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              className: '!bg-dark-800 !text-white !border-dark-600',
            }}
          />
        </EngineProvider>
      </WalletProvider>
    </ErrorBoundary>
  );
}
