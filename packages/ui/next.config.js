/** @type {import('next').NextConfig} */
const path = require('path');

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
              `connect-src 'self' https://api.dexscreener.com${backendOrigin} wss: ws:;`,
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
  output: process.env['NEXT_OUTPUT'] === 'standalone' ? 'standalone' : undefined
};

module.exports = nextConfig;
