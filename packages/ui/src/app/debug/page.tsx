'use client';

import Link from 'next/link';

export default function DebugLayoutPage() {
  return (
    <div className="min-h-screen py-12">
      <h1 className="text-3xl font-bold mb-4">Layout Debug — Container Boundaries</h1>

      <p className="mb-6 text-dark-400">This page visualizes the root/container and content areas used by the app. Resize the browser to verify centered layout and padding.</p>

      <div className="w-full border-2 border-red-500/40 p-4 mb-6">
        <div className="max-w-7xl mx-auto bg-red-500/5 border border-red-300/20 p-6">
          <div className="px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-cyan-800/10 to-purple-800/5 rounded-md">
            <h2 className="text-xl font-semibold mb-2">Inner Container (max-w-7xl + px-4 sm:px-6 lg:px-8)</h2>
            <p className="text-dark-400">This area represents the centered content container used across the app.</p>
          </div>
        </div>
      </div>

      <div className="w-full border-2 border-cyan-500/20 p-4">
        <div className="bg-dark-800 rounded-lg p-6">
          <h3 className="text-lg font-medium mb-2">Viewport</h3>
          <p className="text-dark-400">The outermost area is the viewport. The red border shows the full-width wrapper; the inner container shows content bounds.</p>
        </div>
      </div>

      <div className="mt-8">
        <Link href="/" className="btn-primary">Return to Dashboard</Link>
      </div>
    </div>
  );
}
