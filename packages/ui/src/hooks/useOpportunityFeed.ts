'use client';

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { API_BASE } from '@/lib/apiConfig';
import { getDemoOpportunities } from '@/lib/feed/demoOpportunities';
import type { Opportunity } from '@/lib/feed/types';
import { useFeedStore } from '@/stores/feedStore';

type LivePayload = Opportunity[] | { items?: Opportunity[]; data?: Opportunity[] };

function resolveTimestamp(item: Partial<Opportunity> & Record<string, unknown>, fallback: number): number {
  const raw = item.ts ?? item.timestamp ?? item.createdAt ?? item.updatedAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date.getTime();
    }
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.getTime();
  }
  return fallback;
}

function normalizeLivePayload(payload: LivePayload): Opportunity[] {
  const now = Date.now();
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.data)
        ? payload.data
        : [];

  return rawItems.map((item) => ({
    ...item,
    ts: resolveTimestamp(item as Partial<Opportunity> & Record<string, unknown>, now),
  }));
}

function normalizeStatusFromFreshness(items: Opportunity[]): Opportunity[] {
  const now = Date.now();

  return items.map((item) => {
    const ageMs = Math.max(0, now - item.ts);
    if (ageMs > 10_000) {
      return { ...item, status: 'STALE' };
    }
    if (item.status === 'STALE') {
      return { ...item, status: 'READY' };
    }
    return item;
  });
}

function applyFilters(
  items: Opportunity[],
  chain: 'EVM' | 'SOL' | 'BOTH',
  filters: ReturnType<typeof useFeedStore.getState>['filters']
) {
  const normalized = normalizeStatusFromFreshness(items);
  const now = Date.now();
  const search = filters.search.trim().toLowerCase();

  return normalized
    .filter((item) => (chain === 'BOTH' ? true : item.chain === chain))
    .filter((item) => item.profit.netUsd >= filters.minNetUsd)
    .filter((item) => item.scores.confidence >= filters.minConfidence)
    .filter((item) => (filters.onlyExecutable ? item.status === 'READY' : true))
    .filter((item) => (filters.hideHighRisk ? (item.scores.mevRisk ?? item.scores.volatilityRisk ?? 0) < 0.7 : true))
    .filter((item) => (filters.hideStale ? now - item.ts < 10_000 : true))
    .filter((item) => {
      if (!search) return true;
      const haystack = [
        item.routeLabel,
        item.chain,
        ...item.venues,
        item.tokens.in,
        item.tokens.out,
        ...(item.tokens.mid ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => b.profit.netUsd - a.profit.netUsd);
}

export function useOpportunityFeed() {
  const source = useFeedStore((state) => state.source);
  const chain = useFeedStore((state) => state.chain);
  const filters = useFeedStore((state) => state.filters);
  const setLastTickAgoMs = useFeedStore((state) => state.setLastTickAgoMs);
  const setStreamStatus = useFeedStore((state) => state.setStreamStatus);
  const queryClient = useQueryClient();

  const queryKey = useMemo(() => ['opportunities', source, chain, filters] as const, [source, chain, filters]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (source === 'DEMO') {
        return applyFilters(getDemoOpportunities(), chain, filters);
      }

      const response = await fetch(`${API_BASE}/opportunities`, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load opportunities');
      }

      const payload = (await response.json()) as LivePayload;
      return applyFilters(normalizeLivePayload(payload), chain, filters);
    },
    refetchInterval: source === 'LIVE' ? 8000 : false,
    retry: source === 'LIVE' ? 1 : 0,
  });

  useEffect(() => {
    if (source === 'DEMO') {
      setStreamStatus('DEMO');
      setLastTickAgoMs(0);
      return;
    }

    if (query.isError) {
      setStreamStatus('DELAYED');
      return;
    }

    setStreamStatus(query.isFetching ? 'POLLING' : 'LIVE');
    if (query.dataUpdatedAt) {
      setLastTickAgoMs(Math.max(0, Date.now() - query.dataUpdatedAt));
    }
  }, [source, query.isError, query.isFetching, query.dataUpdatedAt, setLastTickAgoMs, setStreamStatus]);

  useEffect(() => {
    if (source !== 'LIVE') {
      return;
    }

    const stream = new EventSource(`${API_BASE}/opportunities/stream`);

    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as LivePayload;
        const items = normalizeLivePayload(payload);
        queryClient.setQueryData<Opportunity[]>(queryKey, applyFilters(items, chain, filters));
        setStreamStatus('LIVE');
        setLastTickAgoMs(0);
      } catch {
        setStreamStatus('DELAYED');
      }
    };

    stream.addEventListener('snapshot', handleSnapshot as EventListener);
    stream.onerror = () => {
      setStreamStatus('DELAYED');
    };

    return () => {
      stream.removeEventListener('snapshot', handleSnapshot as EventListener);
      stream.close();
    };
  }, [source, queryClient, queryKey, chain, filters, setLastTickAgoMs, setStreamStatus]);

  return query;
}
