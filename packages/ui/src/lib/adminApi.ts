/**
 * Admin API client. Requires X-ADMIN-KEY in sessionStorage (clears on tab close).
 * Pass keyOverride on login to avoid sessionStorage timing issues.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
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
};

export interface AdminAuditEvent {
  ts: number;
  type: 'admin_auth' | 'admin_action';
  ip: string;
  path: string;
  action?: string;
  success: boolean;
  meta?: Record<string, unknown>;
}
