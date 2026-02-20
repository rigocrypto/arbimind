'use client';

import './solana-wallet-ui.css';
import { SolanaProvider } from '@/providers/SolanaProvider';

export default function SolanaWalletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SolanaProvider>{children}</SolanaProvider>;
}
