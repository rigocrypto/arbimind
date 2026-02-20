'use client';

import { FC, ReactNode, useCallback, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { clusterApiUrl } from '@solana/web3.js';
import toast from 'react-hot-toast';
import '@/app/solana-wallet/solana-wallet-ui.css';

const network = WalletAdapterNetwork.Devnet;

export const SolanaProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = clusterApiUrl(network);
  const wallets = useMemo(() => [new BackpackWalletAdapter()], []);

  const handleError = useCallback((err: Error) => {
    const message = err?.message ?? '';
    if (/user rejected|rejected/i.test(message)) {
      toast('Connection cancelled', { icon: '🔒' });
      return;
    }
    console.error('[Solana wallet]', err);
    toast.error(message || 'Wallet error');
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false} onError={handleError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
