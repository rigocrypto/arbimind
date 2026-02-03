'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useEngine } from '@/hooks/useArbiApi';
import { useBalanceGuard } from '@/hooks/useBalanceGuard';

interface EngineContextValue {
  isRunning: boolean;
  activeStrategy: string;
  loading: boolean;
  start: (strategy?: string) => Promise<void>;
  stop: () => Promise<void>;
  singleScan: (strategy?: string) => Promise<boolean>;
  reloadPrices: () => Promise<boolean>;
  checkBalance: () => boolean;
}

const EngineContext = createContext<EngineContextValue | null>(null);

export function EngineProvider({ children }: { children: ReactNode }) {
  const engine = useEngine();
  const { checkBalance } = useBalanceGuard();
  return (
    <EngineContext.Provider value={{ ...engine, checkBalance }}>
      {children}
    </EngineContext.Provider>
  );
}

export function useEngineContext(): EngineContextValue {
  const ctx = useContext(EngineContext);
  if (!ctx) {
    throw new Error('useEngineContext must be used within EngineProvider');
  }
  return ctx;
}
