"use client";

import type { Config } from 'wagmi';
import { http, createConfig } from 'wagmi';
import { mainnet, arbitrum, optimism, base, polygon, polygonAmoy } from 'wagmi/chains';
import { metaMask, walletConnect } from 'wagmi/connectors';

const projectId =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID ||
  '4e6c19a060a6c5bfc0f5d7eadf905bb9';

const ethereumRpcUrl =
  process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL ||
  'https://ethereum-rpc.publicnode.com';
const arbitrumRpcUrl =
  process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL ||
  'https://arbitrum-one-rpc.publicnode.com';
const optimismRpcUrl =
  process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL ||
  'https://optimism-rpc.publicnode.com';
const baseRpcUrl =
  process.env.NEXT_PUBLIC_BASE_RPC_URL ||
  'https://base-rpc.publicnode.com';
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
    chains: [mainnet, arbitrum, optimism, base, polygon, polygonAmoy],
    connectors: [metaMask(), walletConnect({ projectId })],
    transports: {
      [mainnet.id]: http(ethereumRpcUrl),
      [arbitrum.id]: http(arbitrumRpcUrl),
      [optimism.id]: http(optimismRpcUrl),
      [base.id]: http(baseRpcUrl),
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
