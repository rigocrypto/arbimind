"use client";

import type { Config } from 'wagmi';
import { http, createConfig } from 'wagmi';
import { polygon, polygonAmoy } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo-project-id';

function makeConfig(): Config {
  return createConfig({
    chains: [polygon, polygonAmoy],
    connectors: [injected(), walletConnect({ projectId })],
    transports: { [polygon.id]: http(), [polygonAmoy.id]: http() },
    ssr: true,
  });
}

type WagmiConfig = ReturnType<typeof makeConfig>;

declare global {
  interface Window { __wagmiConfig?: WagmiConfig }
}

export const config = typeof window !== 'undefined'
  ? (window.__wagmiConfig ??= makeConfig())
  : makeConfig();
