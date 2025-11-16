'use client';

import React from 'react';
import '@rainbow-me/rainbowkit/styles.css';

import {
  RainbowKitProvider,
  getDefaultWallets,
  darkTheme,
} from '@rainbow-me/rainbowkit';
// @ts-ignore - wagmi v2 type definitions
import { createConfig, WagmiProvider, http } from 'wagmi';
// @ts-ignore - @tanstack/react-query types
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mainnet, arbitrum, base } from 'wagmi/chains';

const { connectors } = getDefaultWallets({
  appName: 'ArbiMind Auto Trader',
  projectId: 'arbimind-demo-id', // You should get a real project ID from WalletConnect Cloud
  chains: [arbitrum, base, mainnet],
});

const config = createConfig({
  // @ts-ignore - wagmi v2 API
  chains: [arbitrum, base, mainnet],
  connectors,
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export default function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider chains={[arbitrum, base, mainnet]}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
