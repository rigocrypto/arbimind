/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    domains: ['assets.coingecko.com'],
  },
  env: {
    NEXT_PUBLIC_APP_NAME: 'ArbiMind',
    NEXT_PUBLIC_APP_DESCRIPTION: 'The brain of on-chain arbitrage',
  },
  // CSP is handled by middleware.ts
  // No headers here to avoid conflicts
  async headers() {
    return [];
  },
  // Disable any built-in CSP
  poweredByHeader: false,
}

module.exports = nextConfig
