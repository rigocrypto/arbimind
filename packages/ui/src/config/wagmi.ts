"use client";

import type { Config } from 'wagmi';
import { http, createConfig } from 'wagmi';
import { polygon, polygonAmoy } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo-project-id';
const polygonRpcUrl =
  process.env.NEXT_PUBLIC_POLYGON_RPC_URL ||
  process.env.NEXT_PUBLIC_POLYGON_RPC ||
  'https://polygon-bor-rpc.publicnode.com';
const polygonAmoyRpcUrl =
  process.env.NEXT_PUBLIC_AMOY_RPC_URL ||
  process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL ||
  process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC ||
  'https://rpc-amoy.polygon.technology';

function makeConfig(): Config {
  return createConfig({
    chains: [polygonAmoy, polygon],
    connectors: [injected(), walletConnect({ projectId })],
    transports: {
      [polygon.id]: http(polygonRpcUrl),
      [polygonAmoy.id]: http(polygonAmoyRpcUrl),
    },
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
