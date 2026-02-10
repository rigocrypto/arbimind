'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 24 }}>
            A client-side error occurred. Please refresh the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              background: 'rgba(34, 211, 238, 0.2)',
              border: '1px solid rgba(34, 211, 238, 0.3)',
              color: '#22d3ee',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Try again
          </button>
          <Link href="/" style={{ marginTop: 16, color: '#9ca3af', fontSize: 14 }}>
            Back to home
          </Link>
        </div>
      </body>
    </html>
  );
}
