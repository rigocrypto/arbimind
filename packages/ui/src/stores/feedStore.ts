import { create } from 'zustand';

import type { Chain, FeedMode, FeedSource } from '@/lib/feed/types';

type ChainFilter = Chain | 'BOTH';

type FeedFilters = {
  minNetUsd: number;
  minConfidence: number;
  onlyExecutable: boolean;
  hideStale: boolean;
  hideHighRisk: boolean;
  search: string;
};

type FeedState = {
  mode: FeedMode;
  chain: ChainFilter;
  source: FeedSource;
  streamStatus: 'LIVE' | 'POLLING' | 'DELAYED';
  lastTickAgoMs: number;
  filters: FeedFilters;
  selectedId: string | null;
  setMode: (mode: FeedMode) => void;
  setChain: (chain: ChainFilter) => void;
  setSource: (source: FeedSource) => void;
  setStreamStatus: (status: FeedState['streamStatus']) => void;
  setLastTickAgoMs: (ms: number) => void;
  setFilters: (patch: Partial<FeedFilters>) => void;
  applyPreset: (preset: 'SAFE' | 'HIGH_PROFIT' | 'SOLANA_FAST') => void;
  select: (id: string | null) => void;
};

export const useFeedStore = create<FeedState>((set) => ({
  mode: 'TRADER',
  chain: 'BOTH',
  source: 'DEMO',
  streamStatus: 'LIVE',
  lastTickAgoMs: 300,
  filters: {
    minNetUsd: 5,
    minConfidence: 0.6,
    onlyExecutable: false,
    hideStale: true,
    hideHighRisk: false,
    search: '',
  },
  selectedId: null,
  setMode: (mode) => set({ mode }),
  setChain: (chain) => set({ chain }),
  setSource: (source) => set({ source }),
  setStreamStatus: (streamStatus) => set({ streamStatus }),
  setLastTickAgoMs: (lastTickAgoMs) => set({ lastTickAgoMs }),
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  applyPreset: (preset) =>
    set(() => {
      if (preset === 'SAFE') {
        return {
          chain: 'BOTH',
          filters: {
            minNetUsd: 5,
            minConfidence: 0.75,
            onlyExecutable: true,
            hideStale: true,
            hideHighRisk: true,
            search: '',
          },
        };
      }
      if (preset === 'HIGH_PROFIT') {
        return {
          chain: 'BOTH',
          filters: {
            minNetUsd: 12,
            minConfidence: 0.55,
            onlyExecutable: false,
            hideStale: false,
            hideHighRisk: false,
            search: '',
          },
        };
      }
      return {
        chain: 'SOL',
        filters: {
          minNetUsd: 3,
          minConfidence: 0.65,
          onlyExecutable: true,
          hideStale: true,
          hideHighRisk: false,
          search: '',
        },
      };
    }),
  select: (id) => set({ selectedId: id }),
}));
