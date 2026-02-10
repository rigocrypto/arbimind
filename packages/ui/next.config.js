/** @type {import('next').NextConfig} */
const path = require('path');
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    optimizePackageImports: [
      'wagmi',
      '@rainbow-me/rainbowkit',
      'recharts',
      '@solana/wallet-adapter-react',
      '@solana/wallet-adapter-react-ui',
    ],
  },
  images: {
    unoptimized: true,
    domains: ['assets.coingecko.com'],
  },
  env: {
    NEXT_PUBLIC_APP_NAME: 'ArbiMind',
    NEXT_PUBLIC_APP_DESCRIPTION: 'The brain of on-chain arbitrage',
  },
  async rewrites() {
    return [
      { source: '/favicon.ico', destination: '/favicon.svg' },
    ];
  },
  // CSP is handled by middleware.ts
  // No headers here to avoid conflicts
  async headers() {
    return [];
  },
  // Disable any built-in CSP
  poweredByHeader: false,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      'pino-pretty': path.resolve(__dirname, 'pino-pretty-stub.js'),
    };
    return config;
  },
}

module.exports = nextConfig
