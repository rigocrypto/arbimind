'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getDemoOpportunities } from '@/lib/feed/demoOpportunities';
import type { Opportunity } from '@/lib/feed/types';
import { useFeedStore } from '@/stores/feedStore';

function applyFilters(
  items: Opportunity[],
  chain: 'EVM' | 'SOL' | 'BOTH',
  filters: ReturnType<typeof useFeedStore.getState>['filters']
) {
  const now = Date.now();
  const search = filters.search.trim().toLowerCase();

  return items
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

  const queryKey = useMemo(() => ['opportunities', source, chain, filters] as const, [source, chain, filters]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (source === 'DEMO') {
        return applyFilters(getDemoOpportunities(), chain, filters);
      }

      const response = await fetch('/api/opportunities', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load opportunities');
      }

      const items = (await response.json()) as Opportunity[];
      return applyFilters(items, chain, filters);
    },
    refetchInterval: source === 'LIVE' ? 5000 : false,
  });

  useEffect(() => {
    if (source === 'DEMO') {
      setStreamStatus('LIVE');
      setLastTickAgoMs(300);
      return;
    }

    setStreamStatus(query.isFetching ? 'POLLING' : 'LIVE');
    if (query.dataUpdatedAt) {
      setLastTickAgoMs(Math.max(0, Date.now() - query.dataUpdatedAt));
    }
  }, [source, query.isFetching, query.dataUpdatedAt, setLastTickAgoMs, setStreamStatus]);

  return query;
}
