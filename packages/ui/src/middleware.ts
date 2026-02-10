import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  try {
    const isDev = process.env.NODE_ENV === 'development';
    const isPlaywright = process.env.PLAYWRIGHT === '1';

    // Skip CSP in dev and when running Playwright E2E (avoids eval blocking wallet adapters).
    if (isDev || isPlaywright) return res;

    const reportOnly = process.env.CSP_REPORT_ONLY === 'true';
    const isLocalhost = req.nextUrl.hostname === 'localhost' || req.nextUrl.hostname === '127.0.0.1';

    // Build connect-src: include API origin from NEXT_PUBLIC_API_URL (e.g. http://localhost:8001)
    const raw = (process.env.NEXT_PUBLIC_API_URL || '').trim();
    const secondHttp = raw ? raw.indexOf('http', raw.indexOf('http') + 5) : -1;
    const apiUrl = secondHttp !== -1 ? raw.substring(0, secondHttp) : raw;
    let apiOrigins = '';
    if (apiUrl) {
      try {
        const u = new URL(apiUrl);
        apiOrigins = ` ${u.origin} ${u.origin.replace(/^http/, 'ws')}`;
      } catch {
        /* ignore invalid URL */
      }
    }
    const localBackend = isLocalhost
      ? `http://localhost:8000 ws://localhost:8000 http://localhost:8001 ws://localhost:8001 http://127.0.0.1:8000 ws://127.0.0.1:8000 http://127.0.0.1:8001 ws://127.0.0.1:8001${apiOrigins}`
      : apiOrigins;

    const prodStrict = [
      `default-src 'self'`,
      `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
      `font-src 'self' data: https://fonts.gstatic.com`,
      `img-src 'self' blob: data: https:`,
      `connect-src 'self' https: wss: ${localBackend}`.trim(),
      `frame-src 'self' https://*.walletconnect.org https://*.reown.com`,
      `worker-src 'self' blob:`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ].join('; ');

    if (reportOnly) {
      res.headers.set('Content-Security-Policy-Report-Only', prodStrict);
    } else {
      res.headers.set('Content-Security-Policy', prodStrict);
    }

    return res;
  } catch (e) {
    console.error('CSP middleware error', e);
    return res;
  }
}

export const config = {
  // Exclude Next static assets to avoid ChunkLoadError (middleware must not touch chunk requests)
  matcher: ['/((?!_next/static|_next/image|api|favicon\\.ico|robots\\.txt|sitemap\\.xml|\\.well-known).*)'],
};

