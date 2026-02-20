'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useEngine } from '@/hooks/useArbiApi';
import { useBalanceGuard } from '@/hooks/useBalanceGuard';

interface EngineContextValue {
  isRunning: boolean;
  activeStrategy: string;
  activeWalletChain: 'evm' | 'solana' | '';
  activeWalletAddress: string;
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

  const checkBalanceWithSolanaSync = () => {
    if (typeof window !== 'undefined') {
      const solanaConnected = window.localStorage.getItem('arbimind:wallet:solanaConnected') === '1';
      const activeChain = window.localStorage.getItem('arbimind:wallet:activeChain');
      if (solanaConnected && activeChain === 'solana') {
        return true;
      }
    }

    return checkBalance();
  };

  return (
    <EngineContext.Provider value={{ ...engine, checkBalance: checkBalanceWithSolanaSync }}>
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
