'use client';

import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { EngineProvider } from '@/contexts/EngineContext';
import { SolanaProvider } from '@/providers/SolanaProvider';
import { config } from '@/config/wagmi';
import '@rainbow-me/rainbowkit/styles.css';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SolanaProvider>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={darkTheme({ accentColor: '#06b6d4', borderRadius: 'medium' })}>
            <EngineProvider>
              {children}
            </EngineProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </SolanaProvider>
  );
}
