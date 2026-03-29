'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAccount, useBalance } from 'wagmi';

import type { FeedMode, Opportunity } from '@/lib/feed/types';
import { WALLET_STATE_UPDATED_EVENT } from '@/lib/walletState';

type PrimaryAction =
  | 'CONNECT_EVM'
  | 'CONNECT_SOL'
  | 'DEPOSIT_EVM'
  | 'DEPOSIT_SOL'
  | 'APPROVE'
  | 'SIMULATE'
  | 'SAVE_STRATEGY'
  | 'CREATE_ALERT'
  | 'REVIEW_RISK'
  | 'INSPECT';

export type FeedWalletCta = {
  action: PrimaryAction;
  label: string;
  hint: string;
  runPrimaryAction: (onInspect?: () => void) => void;
};

function readSolanaAddress(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const connected = window.localStorage.getItem('arbimind:wallet:solanaConnected') === '1';
  const address = window.localStorage.getItem('arbimind:wallet:solanaAddress');
  return connected && address ? address : null;
}

export function useFeedWalletCta(opportunity: Opportunity | null, mode: FeedMode): FeedWalletCta {
  const router = useRouter();
  const { isConnected: isEvmConnected, address: evmAddress } = useAccount();
  const { data: evmNativeBalance } = useBalance({ address: evmAddress });
  const [solanaAddress, setSolanaAddress] = useState<string | null>(() => readSolanaAddress());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const sync = () => setSolanaAddress(readSolanaAddress());
    window.addEventListener(WALLET_STATE_UPDATED_EVENT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);

    return () => {
      window.removeEventListener(WALLET_STATE_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const minEth = useMemo(() => {
    const raw = Number.parseFloat(process.env.NEXT_PUBLIC_MIN_TRADE_ETH || '0.05');
    return Number.isFinite(raw) ? raw : 0.05;
  }, []);
  const minUsd = useMemo(() => {
    const raw = Number.parseFloat(process.env.NEXT_PUBLIC_MIN_TRADE_USDC || '20');
    return Number.isFinite(raw) ? raw : 20;
  }, []);

  const cta = useMemo(() => {
    if (!opportunity) {
      return {
        action: 'INSPECT' as const,
        label: 'Select a route',
        hint: 'Choose an opportunity to unlock chain-specific actions.',
      };
    }

    const isSolanaConnected = Boolean(solanaAddress);
    const chainConnected = opportunity.chain === 'EVM' ? isEvmConnected : isSolanaConnected;
    const evmHasFunds =
      opportunity.chain !== 'EVM'
        ? true
        : evmNativeBalance
          ? Number(evmNativeBalance.formatted) >= minEth
          : true;

    if (!chainConnected) {
      if (opportunity.chain === 'EVM') {
        return {
          action: 'CONNECT_EVM' as const,
          label: 'Open EVM wallet',
          hint: 'Connect EVM first to simulate or execute this route.',
        };
      }
      return {
        action: 'CONNECT_SOL' as const,
        label: 'Open Solana wallet',
        hint: 'Connect Phantom or Solflare to continue with Solana routes.',
      };
    }

    if (mode === 'OPERATOR') {
      if (opportunity.status === 'HIGH_RISK') {
        return {
          action: 'REVIEW_RISK' as const,
          label: 'Review risk',
          hint: 'Risk is elevated for this route. Adjust constraints before automation.',
        };
      }
      return {
        action: opportunity.status === 'READY' ? ('SAVE_STRATEGY' as const) : ('CREATE_ALERT' as const),
        label: opportunity.status === 'READY' ? 'Save as strategy' : 'Create alert',
        hint: 'Operator mode can convert this route into automation rules.',
      };
    }

    if (opportunity.chain === 'EVM' && !evmHasFunds) {
      return {
        action: 'DEPOSIT_EVM' as const,
        label: `Deposit (~$${minUsd} or ${minEth} ETH)`,
        hint: 'EVM balance appears low for minimum execution sizing.',
      };
    }

    switch (opportunity.status) {
      case 'NEEDS_APPROVAL':
        return {
          action: 'APPROVE',
          label: 'Approve tokens',
          hint: 'Approval step is required before simulation/execution.',
        };
      case 'LOW_BALANCE':
        return {
          action: opportunity.chain === 'EVM' ? ('DEPOSIT_EVM' as const) : ('DEPOSIT_SOL' as const),
          label: opportunity.chain === 'EVM' ? `Deposit (~$${minUsd})` : 'Deposit SOL',
          hint: 'Fund your connected wallet to activate this route.',
        };
      case 'HIGH_RISK':
        return {
          action: 'REVIEW_RISK',
          label: 'Review risk',
          hint: 'High volatility/MEV risk detected. Inspect details before action.',
        };
      case 'STALE':
        return {
          action: 'INSPECT',
          label: 'Inspect',
          hint: 'Route is stale. Wait for the next live refresh before executing.',
        };
      default:
        return {
          action: 'SIMULATE',
          label: 'Simulate route',
          hint: 'Wallet-connected and ready for simulation.',
        };
    }
  }, [opportunity, solanaAddress, isEvmConnected, evmNativeBalance, minEth, minUsd, mode]);

  const runPrimaryAction = useCallback(
    (onInspect?: () => void) => {
      switch (cta.action) {
        case 'CONNECT_EVM':
        case 'DEPOSIT_EVM':
          router.push('/wallet');
          return;
        case 'CONNECT_SOL':
        case 'DEPOSIT_SOL':
          router.push('/solana-wallet');
          return;
        case 'APPROVE':
          toast('Approval flow is next (PR C). Open wallet page to approve manually for now.', { icon: '🧪' });
          return;
        case 'SIMULATE':
          toast.success('Simulation endpoint wiring is next. Route is now wallet-ready.');
          return;
        case 'SAVE_STRATEGY':
          toast.success('Strategy template flow is next. Opportunity context is ready.');
          return;
        case 'CREATE_ALERT':
          toast.success('Alert flow is next. Route context captured.');
          return;
        case 'REVIEW_RISK':
          onInspect?.();
          return;
        case 'INSPECT':
        default:
          onInspect?.();
      }
    },
    [cta.action, router]
  );

  return {
    action: cta.action,
    label: cta.label,
    hint: cta.hint,
    runPrimaryAction,
  };
}

