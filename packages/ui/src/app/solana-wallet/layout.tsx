'use client';

import '@solana/wallet-adapter-react-ui/styles.css';
import './solana-wallet-overrides.css';
import { SolanaProvider } from '@/providers/SolanaProvider';

export default function SolanaWalletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SolanaProvider>{children}</SolanaProvider>;
}
