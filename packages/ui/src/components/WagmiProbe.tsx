'use client';
import { useConfig } from 'wagmi';

export function WagmiProbe() {
  useConfig();
  return null;
}
