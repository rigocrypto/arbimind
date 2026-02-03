/**
 * ArbiMind API hook for fetching data and executing actions
 * Falls back to mock data if backend is unavailable
 */

import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
// Disable API calls by default - set to true when backend is ready
const ENABLE_API_CALLS = process.env.NEXT_PUBLIC_ENABLE_API === 'true';

// Types
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  message: string;
  uptime?: number;
}

export interface Metrics {
  profitEth: number;
  profitUsd: number;
  successRate: number;
  totalTrades: number;
  gasUsed: number;
  latencyMs: number;
  pnl24h: number[];
  timestamp: number[];
}

export interface Strategy {
  id: string;
  name: string;
  allocationBps: number; // basis points (0-10000)
  lastPnl: number;
  status: 'active' | 'paused' | 'error';
  active: boolean;
  successRate?: number; // 0-100
  sentiment?: number; // 0-1
}

export interface Opportunity {
  id: string;
  pair: string;
  fromDex: string;
  toDex: string;
  profitPct: number;
  profitEth: number;
  gasEst: number;
  netGain: number;
  timestamp: number;
}

export interface ExecuteResponse {
  ok: boolean;
  txHash?: string;
  pnl?: number;
  error?: string;
}

// Mock data fallbacks
const mockHealth: HealthStatus = {
  status: 'ok',
  message: 'All systems operational',
  uptime: 86400,
};

const mockMetrics: Metrics = {
  profitEth: 2.456,
  profitUsd: 5432.12,
  successRate: 87.5,
  totalTrades: 1247,
  gasUsed: 0.0234,
  latencyMs: 145,
  pnl24h: [0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6],
  timestamp: Array.from({ length: 12 }, (_, i) => Date.now() - (11 - i) * 3600000),
};

const mockStrategies: Strategy[] = [
  {
    id: 'arbitrage',
    name: 'Arbitrage',
    allocationBps: 5000,
    lastPnl: 0.0234,
    status: 'active',
    active: true,
    successRate: 85,
    sentiment: 0.8,
  },
  {
    id: 'trend',
    name: 'Trend Following',
    allocationBps: 3000,
    lastPnl: 0.0156,
    status: 'active',
    active: true,
    successRate: 72,
    sentiment: 0.6,
  },
  {
    id: 'market-making',
    name: 'Market Making',
    allocationBps: 2000,
    lastPnl: -0.0023,
    status: 'paused',
    active: false,
    successRate: 92,
    sentiment: 0.9,
  },
];

const mockOpportunities: Opportunity[] = [
  {
    id: '1',
    pair: 'ETH/USDC',
    fromDex: 'Uniswap V3',
    toDex: 'SushiSwap',
    profitPct: 0.45,
    profitEth: 0.0012,
    gasEst: 0.0008,
    netGain: 0.0004,
    timestamp: Date.now() - 30000,
  },
  {
    id: '2',
    pair: 'WBTC/ETH',
    fromDex: 'Curve',
    toDex: 'Balancer',
    profitPct: 0.32,
    profitEth: 0.0009,
    gasEst: 0.0006,
    netGain: 0.0003,
    timestamp: Date.now() - 60000,
  },
];

// Helper to fetch with fallback
async function fetchWithFallback<T>(
  endpoint: string,
  mockData: T,
  options?: RequestInit
): Promise<{ data: T; shouldRetry: boolean }> {
  // If API calls are disabled, just return mock data
  if (!ENABLE_API_CALLS) {
    return { data: mockData, shouldRetry: false };
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    
    if (response.ok) {
      return { data: await response.json(), shouldRetry: true };
    }
    
    // If rate limited (429), don't retry for a long time
    if (response.status === 429) {
      return { data: mockData, shouldRetry: false };
    }
    
    // Fall back to mock data on 404 or other errors
    return { data: mockData, shouldRetry: true };
  } catch (error) {
    // Network errors - use mock data, but don't spam retries
    return { data: mockData, shouldRetry: false };
  }
}

// Hooks
export function useHealth() {
  const [health, setHealth] = useState<HealthStatus>(mockHealth);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ENABLE_API_CALLS) {
      // If API disabled, just use mock data
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const fetchHealth = async () => {
      if (!isMounted) return;
      
      setLoading(true);
      const { data, shouldRetry } = await fetchWithFallback('/health', mockHealth);
      
      if (!isMounted) return;
      
      setHealth(data);
      setLoading(false);

      // Clear any existing intervals/timeouts
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);

      if (shouldRetry) {
        // Normal polling - every 60s (slower to avoid rate limits)
        intervalId = setInterval(fetchHealth, 60000);
      } else {
        // Rate limited or disabled - wait 5 minutes before retrying
        timeoutId = setTimeout(fetchHealth, 300000);
      }
    };

    // Delay initial fetch to avoid all hooks firing at once
    const initialTimeout = setTimeout(fetchHealth, 1000);
    
    return () => {
      isMounted = false;
      clearTimeout(initialTimeout);
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return { health, loading };
}

export function useMetrics() {
  const [metrics, setMetrics] = useState<Metrics>(mockMetrics);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ENABLE_API_CALLS) {
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const fetchMetrics = async () => {
      if (!isMounted) return;
      
      setLoading(true);
      const { data, shouldRetry } = await fetchWithFallback('/metrics', mockMetrics);
      
      if (!isMounted) return;
      
      setMetrics(data);
      setLoading(false);

      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);

      if (shouldRetry) {
        intervalId = setInterval(fetchMetrics, 60000);
      } else {
        timeoutId = setTimeout(fetchMetrics, 300000);
      }
    };

    // Stagger initial requests - metrics after 2s
    const initialTimeout = setTimeout(fetchMetrics, 2000);
    
    return () => {
      isMounted = false;
      clearTimeout(initialTimeout);
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return { metrics, loading };
}

export function useStrategies() {
  const [strategies, setStrategies] = useState<Strategy[]>(mockStrategies);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ENABLE_API_CALLS) {
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const fetchStrategies = async () => {
      if (!isMounted) return;
      
      setLoading(true);
      const { data, shouldRetry } = await fetchWithFallback('/strategies', mockStrategies);
      
      if (!isMounted) return;
      
      setStrategies(Array.isArray(data) ? data : mockStrategies);
      setLoading(false);

      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);

      if (shouldRetry) {
        intervalId = setInterval(fetchStrategies, 60000);
      } else {
        timeoutId = setTimeout(fetchStrategies, 300000);
      }
    };

    // Stagger initial requests - strategies after 3s
    const initialTimeout = setTimeout(fetchStrategies, 3000);
    
    return () => {
      isMounted = false;
      clearTimeout(initialTimeout);
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return { strategies, loading };
}

export function useOpportunities() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(mockOpportunities);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const fetchOpportunities = async () => {
      if (!isMounted) return;
      
      setLoading(true);
      const res = await fetch(`${API_BASE}/opportunities`).catch(() => null);
      const raw = res?.ok ? await res.json().catch(() => null) : null;
      const data = Array.isArray(raw) ? raw : raw?.data;
      
      if (!isMounted) return;
      
      setOpportunities(Array.isArray(data) ? data : mockOpportunities);
      setLoading(false);

      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(fetchOpportunities, 30000); // Poll every 30s
    };

    const initialTimeout = setTimeout(fetchOpportunities, 2000);
    
    return () => {
      isMounted = false;
      clearTimeout(initialTimeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return { opportunities, loading };
}

export function useEngine() {
  const [isRunning, setIsRunning] = useState(false);
  const [activeStrategy, setActiveStrategy] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!ENABLE_API_CALLS) return;
    try {
      const response = await fetch(`${API_BASE}/engine/status`);
      if (response.ok) {
        const data = await response.json();
        const active = data?.active ?? '';
        setActiveStrategy(typeof active === 'string' ? active : '');
        setIsRunning(!!active);
      }
    } catch {
      // Ignore - backend may be offline
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const start = useCallback(async (strategy: string = 'arbitrage') => {
    setLoading(true);
    try {
      const referrer =
        typeof window !== 'undefined' ? localStorage.getItem('arbimind_ref') : null;
      const body: { strategy: string; referrer?: string } = { strategy };
      if (referrer && /^0x[a-fA-F0-9]{40}$/.test(referrer)) body.referrer = referrer;
      const response = await fetch(`${API_BASE}/engine/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setActiveStrategy(strategy);
        setIsRunning(true);
      }
    } catch (error) {
      console.error('Failed to start engine:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/engine/stop`, {
        method: 'POST',
      });
      if (response.ok) {
        setActiveStrategy('');
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Failed to stop engine:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const singleScan = useCallback(async (strategy?: string) => {
    try {
      const response = await fetch(`${API_BASE}/engine/single-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: strategy || activeStrategy || 'arbitrage' }),
      });
      return response.ok;
    } catch (error) {
      console.error('Single scan failed:', error);
      return false;
    }
  }, [activeStrategy]);

  const reloadPrices = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/engine/reload-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.ok;
    } catch (error) {
      console.error('Reload prices failed:', error);
      return false;
    }
  }, []);

  return { isRunning, activeStrategy, loading, start, stop, singleScan, reloadPrices };
}

export function useExecute() {
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async (opportunityId: string): Promise<ExecuteResponse> => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId }),
      });
      
      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        return { ok: false, error: 'Execution failed' };
      }
    } catch (error) {
      console.error('Failed to execute:', error);
      return { ok: false, error: 'Network error' };
    } finally {
      setLoading(false);
    }
  }, []);

  return { execute, loading };
}

