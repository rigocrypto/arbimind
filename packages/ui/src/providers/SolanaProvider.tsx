'use client';

import { useCallback, useMemo } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import toast from 'react-hot-toast';
const CLUSTERS = ['devnet', 'mainnet-beta', 'testnet'] as const;
const CLUSTER = (CLUSTERS.includes(process.env.NEXT_PUBLIC_SOLANA_CLUSTER as typeof CLUSTERS[number])
  ? process.env.NEXT_PUBLIC_SOLANA_CLUSTER
  : 'devnet') as 'devnet' | 'mainnet-beta' | 'testnet';
const CUSTOM_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || '';

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => {
    if (CUSTOM_RPC) return CUSTOM_RPC;
    return clusterApiUrl(CLUSTER);
  }, []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BackpackWalletAdapter()],
    []
  );

  const onError = useCallback((err: Error) => {
    const msg = err?.message ?? '';
    const isUserReject = /user rejected|rejected/i.test(msg);
    if (isUserReject) {
      toast('Connection cancelled', { icon: '🔒' });
      return;
    }
    console.error('[Solana wallet]', err);
    toast.error(msg || 'Wallet error');
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect={false} onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
