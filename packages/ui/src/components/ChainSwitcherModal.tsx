'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useSwitchChain } from 'wagmi';
import { mainnet, arbitrum, base } from 'wagmi/chains';
import Image from 'next/image';

const EVM_CHAINS = [
  { id: mainnet.id, name: 'Ethereum', color: 'from-slate-400 to-slate-600' },
  { id: arbitrum.id, name: 'Arbitrum', color: 'from-blue-400 to-blue-600' },
  { id: base.id, name: 'Base', color: 'from-cyan-400 to-blue-500' },
];

interface ChainSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called instead of RainbowKit's openChainModal */
  onEVMChainSelect?: (chainId: number) => void;
}

export function ChainSwitcherModal({ isOpen, onClose, onEVMChainSelect }: ChainSwitcherModalProps) {
  const router = useRouter();
  const { chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const handleEVMSelect = useCallback(
    (targetChainId: number) => {
      if (targetChainId === chainId) {
        onClose();
        return;
      }
      if (onEVMChainSelect) {
        onEVMChainSelect(targetChainId);
      } else {
        switchChain?.({ chainId: targetChainId });
      }
      onClose();
    },
    [chainId, onEVMChainSelect, switchChain, onClose]
  );

  const handleSolanaSelect = useCallback(() => {
    router.push('/solana-wallet');
    onClose();
  }, [router, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-end pt-20 pr-4 pb-4 pl-4 sm:pt-20 sm:pr-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative z-[9999] w-full max-w-sm rounded-xl bg-dark-800 border border-dark-600 shadow-2xl overflow-hidden"
        role="dialog"
        aria-label="Switch network"
      >
        <div className="p-4 border-b border-dark-600">
          <h3 className="text-lg font-bold text-white">Switch Network</h3>
          <p className="text-sm text-dark-400 mt-0.5">Choose EVM chain or Solana</p>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {/* EVM Chains */}
          {EVM_CHAINS.map((chain) => (
            <button
              key={chain.id}
              type="button"
              onClick={() => handleEVMSelect(chain.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-700/50 transition text-left"
            >
              <div
                className={`w-8 h-8 rounded-full bg-gradient-to-br ${chain.color} flex items-center justify-center text-white text-xs font-bold`}
              >
                {chain.name[0]}
              </div>
              <span className="font-medium text-white">{chain.name}</span>
              {chainId === chain.id && (
                <span className="ml-auto text-xs text-green-400 font-medium">Connected</span>
              )}
            </button>
          ))}
          {/* Solana */}
          <button
            type="button"
            onClick={handleSolanaSelect}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dark-700/50 transition text-left border-t border-dark-600"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Image
                src="/solana/solana-logo.svg"
                alt="Solana Logo"
                width={28}
                height={28}
                className="rounded-full"
                unoptimized
              />
            </div>
            <span className="font-medium text-white flex items-center gap-2">
              Solana
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cyan-700/70 text-xs font-semibold text-cyan-200 ml-1">Ecosystem</span>
            </span>
            <span className="ml-auto text-xs text-dark-400">Devnet / Mainnet</span>
          </button>
        </div>
      </div>
    </div>
  );
}
