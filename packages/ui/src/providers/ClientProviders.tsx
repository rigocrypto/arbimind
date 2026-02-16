'use client';

import { Toaster } from 'react-hot-toast';
import { EngineProvider } from '@/contexts/EngineContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';


export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <EngineProvider>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            className: '!bg-dark-800 !text-white !border-dark-600',
          }}
        />
      </EngineProvider>
    </ErrorBoundary>
  );
}
