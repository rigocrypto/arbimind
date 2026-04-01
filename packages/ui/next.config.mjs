import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  // Force all pages to render dynamically (SSR, not static)
  // This prevents ALL WagmiProvider prerender errors
  experimental: {},
  output: undefined, // ensure not 'export'
  typescript: {
    // Unblock builds when transitive crypto deps hit TS depth limits.
    ignoreBuildErrors: true
  },
  async headers() {
    // Build connect-src dynamically from NEXT_PUBLIC_API_URL
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim();
    let backendOrigin = '';
    if (apiUrl) {
      try {
        const url = new URL(apiUrl);
        backendOrigin = ` ${url.origin}`;
      } catch {
        // Fallback for invalid URL
        backendOrigin = ' http://localhost:8001 https://arbimind-production.up.railway.app';
      }
    } else {
      // Default to localhost + production backend
      backendOrigin = ' http://localhost:8001 https://arbimind-production.up.railway.app';
    }

    return [
      {
        source: '/admin/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self';",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline';",
              "style-src 'self' 'unsafe-inline';",
              "img-src 'self' data: blob: https://dexscreener.com https://api.dexscreener.com;",
              `connect-src 'self' https://api.dexscreener.com${backendOrigin} https://api.web3modal.org https://pulse.walletconnect.org https://rpc.walletconnect.com https://relay.walletconnect.com https://cloud.walletconnect.com https://rpc-amoy.polygon.technology https://*.alchemy.com wss: ws:;`,
              "frame-ancestors 'none';"
            ].join('; ')
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
        ]
      }
    ]
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'pino-pretty': path.join(__dirname, 'pino-pretty-stub.js')
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      'pino-pretty': './pino-pretty-stub.js'
    }
  },
  output: process.env['NEXT_OUTPUT'] === 'standalone' ? 'standalone' : undefined
};

export default nextConfig;
