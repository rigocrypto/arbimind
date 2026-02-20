'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { EngineProvider } from '@/contexts/EngineContext';
import { config } from '@/config/wagmi';
import '@rainbow-me/rainbowkit/styles.css';
import '@/app/solana-wallet/solana-wallet-ui.css';

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import toast from 'react-hot-toast';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const solanaEndpoint = useMemo(() => clusterApiUrl('devnet'), []);
  const solanaWallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BackpackWalletAdapter()],
    []
  );

  const handleSolanaError = useCallback((err: Error) => {
    const message = err?.message ?? '';
    if (/user rejected|rejected/i.test(message)) {
      toast('Connection cancelled', { icon: '🔒' });
      return;
    }
    console.error('[Solana wallet]', err);
    toast.error(message || 'Wallet error');
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#06b6d4', borderRadius: 'medium' })}>
          <ConnectionProvider endpoint={solanaEndpoint}>
            <WalletProvider wallets={solanaWallets} autoConnect={false} onError={handleSolanaError}>
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
