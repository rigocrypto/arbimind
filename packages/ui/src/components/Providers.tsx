
'use client';

import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { EngineProvider } from '@/contexts/EngineContext';
import { config } from '@/config/wagmi';
import '@rainbow-me/rainbowkit/styles.css';
import '@solana/wallet-adapter-react-ui/styles.css';

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const solanaEndpoint = clusterApiUrl('devnet');
  const solanaWallets = useState(() => [
    // Add other wallet adapters here if needed, but exclude Phantom and Solflare
  ])[0];

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#06b6d4', borderRadius: 'medium' })}>
          <ConnectionProvider endpoint={solanaEndpoint}>
            <WalletProvider wallets={solanaWallets} autoConnect>
              <WalletModalProvider>
                <EngineProvider>
                  {children}
                </EngineProvider>
              </WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
