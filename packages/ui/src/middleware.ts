import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Consider this development when NODE_ENV is not 'production'.
  // Do NOT treat requests to localhost as production - local hostname
  // should not force permissive CSP in a production-started server.
  const isDev = process.env.NODE_ENV !== 'production';

  // Allow explicit env toggle to enable unsafe-eval in non-production environments
  const allowUnsafeEval = process.env.ALLOW_UNSAFE_EVAL_DEV === 'true';
  const reportOnly = process.env.CSP_REPORT_ONLY === 'true';

  const devPermissive = `default-src 'self' blob: data: https:; script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https:; font-src 'self' data: https://fonts.gstatic.com https:; img-src 'self' blob: data: https:; connect-src * ws: wss: http: https:; worker-src blob: https:; child-src blob: https:; frame-src *; object-src 'none'; base-uri 'self';`;

  // Prod CSP: broad connect-src (https: wss:) for all RPCs/wallets - standard for Web3 dApps
  const prodStrict = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `img-src 'self' blob: data: https:`,
    `connect-src 'self' https: wss:`,
    `frame-src 'self' https://*.walletconnect.org https://*.reown.com`,
    `worker-src 'self' blob:`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  const usePermissive = isDev || (allowUnsafeEval && process.env.NODE_ENV !== 'production');

  if (usePermissive) {
    // Dev / explicit-allow: permissive CSP so dev tooling (HMR, source-maps)
    // and wallet providers are not blocked locally.
    res.headers.set('Content-Security-Policy', devPermissive);
  } else {
    // Production / locked down mode.
    // If `CSP_REPORT_ONLY=true` is set, expose the strict policy as report-only
    // so you can observe violations without blocking traffic.
    if (reportOnly) {
      res.headers.set('Content-Security-Policy-Report-Only', prodStrict);
    } else {
      res.headers.set('Content-Security-Policy', prodStrict);
    }
  }

  // Allow a hard override to force strict CSP regardless of hostname or NODE_ENV.
  // This is useful when testing production behavior on localhost: set
  // `FORCE_STRICT_CSP=true` in your environment to enforce strict policy.
  if (process.env.FORCE_STRICT_CSP === 'true') {
    if (reportOnly) {
      res.headers.set('Content-Security-Policy-Report-Only', prodStrict);
    } else {
      res.headers.set('Content-Security-Policy', prodStrict);
    }
  }

  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|\\.well-known).*)'],
};

