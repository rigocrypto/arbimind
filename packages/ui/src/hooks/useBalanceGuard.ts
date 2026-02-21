'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { parseEther } from 'viem';
import toast from 'react-hot-toast';
import { notifyWalletStateUpdated } from '@/lib/walletState';

const USDC_BY_CHAIN: Record<number, `0x${string}`> = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const,     // Mainnet
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const, // Arbitrum
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,  // Base
};

const MIN_ETH = (() => {
  const v = parseFloat(process.env.NEXT_PUBLIC_MIN_TRADE_ETH || '0.05');
  return Number.isFinite(v) ? v : 0.05;
})();
const MIN_USDC = (() => {
  const v = parseFloat(process.env.NEXT_PUBLIC_MIN_TRADE_USDC || '125');
  return Number.isFinite(v) ? v : 125;
})();

export function useBalanceGuard() {
  const { address, isConnected, chainId } = useAccount();
  const prevConnected = useRef(false);

  const { data: ethBalance } = useBalance({ address });
  const usdcToken = address && chainId ? USDC_BY_CHAIN[chainId] : null;
  const { data: usdcBalance } = useBalance({
    address: address ?? undefined,
    token: usdcToken ?? undefined,
  });

  const checkBalance = useCallback((): boolean => {
    if (!isConnected || !address) return false;

    const minEthWei = parseEther(MIN_ETH.toString());
    const minUsdcRaw = BigInt(Math.floor(MIN_USDC * 1e6)); // USDC 6 decimals

    const ethOk = ethBalance?.value !== undefined && ethBalance.value >= minEthWei;
    const usdcOk = usdcBalance?.value !== undefined && usdcBalance.value >= minUsdcRaw;

    // If we have no balance data yet, allow (don't block)
    const hasEthData = ethBalance?.value !== undefined;
    const hasUsdcData = usdcBalance?.value !== undefined;
    if (!hasEthData && !hasUsdcData) return true;

    if (ethOk || usdcOk) return true;

    toast.error(
      `Need ${MIN_ETH} ETH or ~$${MIN_USDC} USDC to trade. Deposit?`,
      { duration: 5000 }
    );
    return false;
  }, [isConnected, address, ethBalance?.value, usdcBalance?.value]);

  // Run balance check after wallet connects (delayed to avoid hydration/setState race with ConnectModal)
  useEffect(() => {
    if (!isConnected) {
      prevConnected.current = false;
      if (typeof window !== 'undefined') {
        const activeChain = window.localStorage.getItem('arbimind:wallet:activeChain');
        if (activeChain === 'evm') {
          window.localStorage.removeItem('arbimind:wallet:activeChain');
          window.localStorage.removeItem('arbimind:wallet:evmAddress');
          notifyWalletStateUpdated();
        }
      }
      return;
    }

    if (typeof window !== 'undefined' && address) {
      window.localStorage.setItem('arbimind:wallet:activeChain', 'evm');
      window.localStorage.setItem('arbimind:wallet:evmAddress', address);
      notifyWalletStateUpdated();
    }

    if (prevConnected.current) return;
    prevConnected.current = true;
    // Defer past hydration + modal close so we don't trigger "setState during render" in RainbowKit
    const t = setTimeout(() => checkBalance(), 2000);
    return () => clearTimeout(t);
  }, [isConnected, checkBalance]);

  return { checkBalance, ethBalance, usdcBalance, minEth: MIN_ETH, minUsdc: MIN_USDC };
}
