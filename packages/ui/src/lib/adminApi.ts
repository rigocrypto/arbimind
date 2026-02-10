/**
 * Admin API client. Requires X-ADMIN-KEY in sessionStorage (clears on tab close).
 * Pass keyOverride on login to avoid sessionStorage timing issues.
 */

import { API_BASE } from './apiConfig';
const ADMIN_KEY_STORAGE = 'arbimind_admin_key';

export function getAdminKey(): string {
  if (typeof window === 'undefined') return '';
  return (sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '').trim();
}

export function setAdminKey(key: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key.trim());
}

export function clearAdminKey(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

export function hasAdminKey(): boolean {
  return !!getAdminKey();
}

type AdminFetchOpts = RequestInit & { keyOverride?: string };

async function adminFetch<T>(
  path: string,
  options: AdminFetchOpts = {}
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  const { keyOverride, ...fetchOpts } = options;
  const key = (keyOverride ?? getAdminKey()).trim();

  if (!key) {
    return { ok: false, error: 'Admin key not set', status: 401 };
  }

  try {
    const base = API_BASE.endsWith('/api') ? API_BASE : API_BASE.replace(/\/$/, '');
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers((fetchOpts.headers as HeadersInit) ?? {});
    headers.set('Content-Type', 'application/json');
    headers.set('X-ADMIN-KEY', key);
    const res = await fetch(url, {
      ...fetchOpts,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: (data as { error?: string })?.error || res.statusText,
        status: res.status,
      };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface AdminMetrics {
  ok?: boolean;
  version?: string;
  range?: string;
  timestamp?: string;
  metrics: {
    netProfit24h: number;
    grossProfit: number;
    gasSpend: number;
    winRate: number;
    txCount: number;
    failedTxCount: number;
    pnlSeries: { time: number; netProfit: number; gasCost: number }[];
  };
}

export interface AdminTx {
  id: string;
  time: number;
  hash: string;
  strategy: string;
  status: 'success' | 'failed' | 'pending';
  grossProfit: number;
  netProfit: number;
  gasCost: number;
  blockNumber: number;
}

export interface AdminWallets {
  wallets: {
    execution: { address: string; balanceEth: number | null; balanceUsdc: number | null };
    treasury: { address: string; balanceEth: number | null; balanceUsdc: number | null };
  };
}

export interface AIDexPairResponse {
  pair: {
    chainId?: string;
    chainKey?: string;
    dexId?: string;
    pairAddress?: string;
    baseToken?: { symbol?: string };
    quoteToken?: { symbol?: string };
    priceUsd?: number;
    priceChange?: { h1?: number; h24?: number };
    volume?: { h1?: number; h24?: number };
    liquidity?: { usd?: number };
    txns?: { h1?: { buys?: number; sells?: number }; h24?: { buys?: number; sells?: number } };
  };
  alerts?: { volumeSpike?: boolean; txSpike?: boolean };
  timestamp?: string;
}

export interface AIPredictionRow {
  id: string;
  createdAt?: string;
  resolvedAt?: string | null;
  chain?: string;
  pairAddress?: string;
  horizonSec?: number;
  model?: string;
  signal?: string;
  confidence?: number;
  entryPriceUsd?: number;
  returnPct?: number;
  correct?: boolean | null;
}

export interface AIPredictionAccuracyRow {
  horizon_sec: number;
  model: string;
  total: number;
  resolved: number;
  hit_rate: number | null;
  avg_return_pct?: number | null;
  median_return_pct?: number | null;
  avg_confidence?: number | null;
}

export interface AIWatchlistItem {
  chain: string;
  pairAddress: string;
  createdAt: number;
  expiresAt: number;
  lastPolledAt?: number | null;
}

export const adminApi = {
  async getMetrics(range: '24h' | '7d' | '30d' = '24h', keyOverride?: string) {
    return adminFetch<AdminMetrics>(`/admin/metrics?range=${range}`, { keyOverride });
  },
  async getTxs(params?: { limit?: number; strategy?: string; status?: string }) {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.strategy) sp.set('strategy', params.strategy);
    if (params?.status) sp.set('status', params.status);
    return adminFetch<{ txs: AdminTx[]; total: number }>(`/admin/txs?${sp}`);
  },
  async getWallets() {
    return adminFetch<AdminWallets>('/admin/wallets');
  },
  async pauseEngine() {
    return adminFetch<{ paused: boolean }>('/admin/engine/pause', { method: 'POST' });
  },
  async resumeEngine() {
    return adminFetch<{ paused: boolean }>('/admin/engine/resume', { method: 'POST' });
  },
  async getEngineStatus() {
    return adminFetch<{ paused: boolean }>('/admin/engine/status');
  },
  async getAudit(params?: { limit?: number; failuresOnly?: boolean }) {
    const sp = new URLSearchParams();
    if (params?.limit) sp.set('limit', String(params.limit));
    return adminFetch<{ events: AdminAuditEvent[] }>(`/admin/audit?${sp}`);
  },
  async getSnapshotsLastRun(chain: 'evm' | 'solana') {
    return adminFetch<{
      run: {
        id: string;
        chain: string;
        startedAt: string;
        finishedAt: string | null;
        ok: boolean | null;
        usersProcessed: number;
        successCount: number;
        failedCount: number;
        durationMs: number | null;
        error: string | null;
      } | null;
    }>(`/admin/snapshots/last-run?chain=${chain}`);
  },
  async getAIDexPair(pairAddress: string) {
    const sp = new URLSearchParams();
    sp.set('pair', pairAddress);
    return adminFetch<AIDexPairResponse>(`/admin/ai-dashboard/dex?${sp.toString()}`);
  },
  async getAIDexHistory(pairAddress: string, window: '6h' | '24h' | '7d') {
    const sp = new URLSearchParams();
    sp.set('pair', pairAddress);
    sp.set('window', window);
    return adminFetch<{
      pair: string;
      points: Array<{
        ts: number;
        priceUsd?: number;
        liquidityUsd?: number;
        volumeH24?: number;
        buysH1?: number;
        sellsH1?: number;
      }>;
      window: string;
      timestamp?: string;
    }>(`/admin/ai-dashboard/dex/history?${sp.toString()}`);
  },
  async getAIPredictions(pairAddress: string, window: '6h' | '24h' | '7d', limit = 200) {
    const sp = new URLSearchParams();
    sp.set('pair', pairAddress);
    sp.set('window', window);
    sp.set('limit', String(limit));
    return adminFetch<{ rows: AIPredictionRow[] }>(`/admin/ai-dashboard/predictions?${sp.toString()}`);
  },
  async getAIPredictionAccuracy(pairAddress: string, window: '6h' | '24h' | '7d') {
    const sp = new URLSearchParams();
    sp.set('pair', pairAddress);
    sp.set('window', window);
    return adminFetch<{ rows: AIPredictionAccuracyRow[] }>(`/admin/ai-dashboard/predictions/accuracy?${sp.toString()}`);
  },
  async evaluateAIPredictions(pairAddress: string) {
    const sp = new URLSearchParams();
    sp.set('pair', pairAddress);
    return adminFetch<{ evaluated: number }>(`/admin/ai-dashboard/predictions/evaluate?${sp.toString()}`, { method: 'POST' });
  },
  async createAIPrediction(payload: Record<string, unknown>) {
    return adminFetch<{ id: string | null }>('/admin/ai-dashboard/predictions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async getAIWatchlist() {
    return adminFetch<{ count: number; items: AIWatchlistItem[] }>('/admin/ai-dashboard/watchlist');
  },
  async watchAIPair(pairAddress: string, chain?: string, ttlHours?: number) {
    return adminFetch<{ count: number; item?: AIWatchlistItem }>(`/admin/ai-dashboard/watch`, {
      method: 'POST',
      body: JSON.stringify({ pairAddress, chain, ttlHours }),
    });
  },
  async unwatchAIPair(pairAddress: string, chain?: string) {
    const sp = new URLSearchParams();
    sp.set('pair', pairAddress);
    if (chain) sp.set('chain', chain);
    return adminFetch<{ count: number }>(`/admin/ai-dashboard/watch?${sp.toString()}`, {
      method: 'DELETE',
    });
  },
};

/** Public endpoint – no admin key required. */
export async function getSnapshotsHealth(chain: 'evm' | 'solana'): Promise<{
  ok: boolean;
  lastRunAt: string | null;
  lastOkAt: string | null;
  stale: boolean;
} | null> {
  try {
    const base = API_BASE.endsWith('/api') ? API_BASE : API_BASE.replace(/\/$/, '');
    const url = `${base}/snapshots/health?chain=${chain}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) return null;
    return data;
  } catch {
    return null;
  }
}

export interface AdminAuditEvent {
  ts: number;
  type: 'admin_auth' | 'admin_action';
  ip: string;
  path: string;
  action?: string;
  success: boolean;
  meta?: Record<string, unknown>;
}
