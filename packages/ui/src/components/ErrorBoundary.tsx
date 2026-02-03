'use client';

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto" />
            <h1 className="text-xl font-bold text-white">Loading failed</h1>
            <p className="text-dark-400 text-sm">
              Please refresh the page. If the problem persists, try clearing cache.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 font-medium transition"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
