'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <AlertTriangle className="w-16 h-16 text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-white">Something went wrong</h1>
        <p className="text-dark-400 text-sm">
          A client-side error occurred. Try refreshing or check your connection.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <pre className="text-left text-xs text-dark-500 bg-dark-800 p-4 rounded-lg overflow-auto max-h-32">
            {error.message}
          </pre>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 font-medium transition"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
        <Link
          href="/"
          className="block text-sm text-dark-400 hover:text-cyan-400 transition"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
