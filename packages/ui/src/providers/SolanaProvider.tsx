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

/** Strip API-key query params so secrets in NEXT_PUBLIC_ env vars never reach the browser. */
function stripApiKeys(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    const sensitive = ['api-key', 'api_key', 'apikey', 'apiKey'];
    let stripped = false;
    for (const key of sensitive) {
      if (u.searchParams.has(key)) {
        u.searchParams.delete(key);
        stripped = true;
      }
    }
    if (stripped && process.env.NODE_ENV === 'development') {
      console.warn('[SolanaProvider] Stripped API key query param from RPC URL — use a server-side proxy instead');
    }
    return u.toString();
  } catch {
    return url;
  }
}

function resolveRpcOverride(cluster: SolanaCluster): string {
  const generic = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || '';
  let url: string;
  if (cluster === 'mainnet-beta') {
    url =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET_BETA?.trim() ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET?.trim() ||
      generic;
  } else if (cluster === 'testnet') {
    url = process.env.NEXT_PUBLIC_SOLANA_RPC_URL_TESTNET?.trim() || generic;
  } else {
    url = process.env.NEXT_PUBLIC_SOLANA_RPC_URL_DEVNET?.trim() || generic;
  }
  return stripApiKeys(url);
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
