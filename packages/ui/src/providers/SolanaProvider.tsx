'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import toast from 'react-hot-toast';

type SolanaCluster = 'devnet' | 'mainnet-beta' | 'testnet';

function normalizeCluster(raw?: string | null): SolanaCluster {
  if (raw === 'devnet' || raw === 'testnet' || raw === 'mainnet-beta') return raw;
  const fromEnv = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
  if (fromEnv === 'devnet' || fromEnv === 'testnet' || fromEnv === 'mainnet-beta') return fromEnv;
  return 'mainnet-beta';
}

function resolveRpcOverride(cluster: SolanaCluster): string {
  const generic = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || '';
  if (cluster === 'mainnet-beta') {
    return (
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET_BETA?.trim() ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET?.trim() ||
      generic
    );
  }
  if (cluster === 'testnet') {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL_TESTNET?.trim() || generic;
  }
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL_DEVNET?.trim() || generic;
}

export function SolanaProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const clusterQuery = searchParams.get('cluster');
  const cluster = useMemo(() => normalizeCluster(clusterQuery), [clusterQuery]);
  const endpoint = useMemo(() => {
    const override = resolveRpcOverride(cluster);
    if (override) return override;
    return clusterApiUrl(cluster);
  }, [cluster]);
  const wallets = useMemo(() => [new BackpackWalletAdapter()], []);

  const onError = useCallback((err: Error) => {
    const msg = err?.message ?? '';
    const isUserReject = /user rejected|rejected/i.test(msg);
    if (isUserReject) {
      toast('Connection cancelled', { icon: '🔒' });
      return;
    }
    if (/walletnotselectederror|wallet not selected|not found/i.test(msg)) return;
    console.error('[Solana wallet]', err);
    toast.error(msg || 'Wallet error');
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
