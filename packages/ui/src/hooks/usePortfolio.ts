// Custom error type for portfolio errors
interface PortfolioError extends Error {
  status?: number;
  response?: unknown;
}

function getPortfolioRefetchInterval(error: unknown): number | false {
  if (typeof error === 'object' && error && 'status' in error) {
    const status = (error as PortfolioError).status;
    if (status === 503) return false;
  }
  return REFETCH_INTERVAL_MS;
}
// 'use client';
// Next.js client directive (should be at top, but TypeScript expects no stray expressions)

import { useQuery } from '@tanstack/react-query';
import { API_BASE } from '@/lib/apiConfig';

export type PortfolioChain = 'evm' | 'solana';

export interface PortfolioSummary {
  chain: PortfolioChain;
  userAddress: string;
  arbAddress: string;
  totals: {
    depositedUsd?: number;
    withdrawnUsd?: number;
    feesUsd?: number;
    pnlUsd?: number;
    roiPct?: number;
    equityUsd?: number;
  };
  balances: Array<{ symbol: string; amount: string; usd?: number }>;
  deposits: Array<{ tx: string; ts: number; symbol: string; amount: string; usd?: number }>;
  withdrawals: Array<{ tx: string; ts: number; symbol: string; amount: string; usd?: number }>;
  updatedAt: number;
}

export interface TimeseriesPoint {
  ts: number;
  equityUsd?: number;
  pnlUsd?: number;
  depositsUsd?: number;
  withdrawalsUsd?: number;
  drawdownPct?: number;
}

export interface TimeseriesResponse {
  points: TimeseriesPoint[];
  /** Backend method; use string for forward compatibility when new methods are added */
  method: 'estimated_linear_ramp_to_current_equity' | 'snapshotted_daily_equity' | string;
}

const REFETCH_INTERVAL_MS = 30_000;

export function usePortfolioSummary(chain: PortfolioChain | null, address: string | undefined) {
  return useQuery({
    queryKey: ['portfolio', chain, address],
    queryFn: async (): Promise<PortfolioSummary> => {
      if (!chain || !address) throw new Error('Missing chain or address');
      const url =
        chain === 'evm'
          ? `${API_BASE}/portfolio/evm?address=${encodeURIComponent(address)}`
          : `${API_BASE}/portfolio/solana?address=${encodeURIComponent(address)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Attach status for retry logic
        const error: PortfolioError = new Error(err.error || res.statusText || 'Portfolio fetch failed');
        error.status = res.status;
        throw error;
      }
      return res.json();
    },
    enabled: !!(chain && address),
    refetchInterval: (query) => getPortfolioRefetchInterval(query.state.error),
    staleTime: 15_000,
    retry: 0,
  });
}

export function usePortfolioTimeseries(
  chain: PortfolioChain | null,
  address: string | undefined,
  range: '7d' | '30d' | '90d' = '30d'
) {
  return useQuery({
    queryKey: ['portfolio-timeseries', chain, address, range],
    queryFn: async (): Promise<TimeseriesResponse> => {
      if (!chain || !address) throw new Error('Missing chain or address');
      const url =
        chain === 'evm'
          ? `${API_BASE}/portfolio/evm/timeseries?address=${encodeURIComponent(address)}&range=${range}`
          : `${API_BASE}/portfolio/solana/timeseries?address=${encodeURIComponent(address)}&range=${range}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const error: PortfolioError = new Error(err.error || res.statusText || 'Timeseries fetch failed');
        error.status = res.status;
        throw error;
      }
      return res.json();
    },
    enabled: !!(chain && address),
    refetchInterval: (query) => getPortfolioRefetchInterval(query.state.error),
    staleTime: 30_000,
    retry: 0,
  });
}
