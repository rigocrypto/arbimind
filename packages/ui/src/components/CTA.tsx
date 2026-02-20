'use client';

import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { fadeIn } from '@/lib/animations';
import toast from 'react-hot-toast';
import { useRef } from 'react';

const AMOY_CHAIN_ID_HEX = '0x13882';
const AMOY_RPC_URL =
  process.env.NEXT_PUBLIC_AMOY_RPC_URL ||
  process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL ||
  process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC ||
  'https://rpc-amoy.polygon.technology';
const AMOY_EXPLORER_URL = process.env.NEXT_PUBLIC_AMOY_EXPLORER_URL || 'https://amoy.polygonscan.com';

export function CTA() {
  const connectingRef = useRef(false);

  const handleConnectWallet = async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    // Mock wallet connection
    const anyEthereum = typeof window !== 'undefined'
      ? (window as Window & {
          ethereum?: {
            isMetaMask?: boolean;
            providers?: Array<{
              isMetaMask?: boolean;
              request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
            }>;
            request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
          };
        }).ethereum
      : undefined;

    const ethereum = anyEthereum?.providers?.find((provider) => provider?.isMetaMask) ?? anyEthereum;

    if (!ethereum?.request) {
      toast.error('MetaMask not installed');
      connectingRef.current = false;
      return;
    }

    try {
      await ethereum.request({ method: 'eth_requestAccounts' });

      try {
        await ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: AMOY_CHAIN_ID_HEX }],
        });
      } catch (switchError) {
        const switchCode =
          typeof switchError === 'object' && switchError !== null && 'code' in switchError
            ? (switchError as { code?: number }).code
            : undefined;

        if (switchCode === 4902) {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: AMOY_CHAIN_ID_HEX,
                chainName: 'Polygon Amoy Testnet',
                nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
                rpcUrls: [AMOY_RPC_URL],
                blockExplorerUrls: [AMOY_EXPLORER_URL],
              },
            ],
          });
        } else if (switchCode !== 4001) {
          throw switchError;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wallet connection failed';
      if (/user rejected|rejected/i.test(message)) {
        toast('Connection cancelled', { icon: '🔒' });
      } else {
        toast.error(message || 'Wallet connection failed');
      }
    } finally {
      connectingRef.current = false;
    }
  };

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-dark-900 via-purple-900/10 to-teal-900/10">
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          variants={fadeIn}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-teal-400 bg-clip-text text-transparent">
            Start Earning Autonomously
          </h2>
          <p className="text-dark-400 text-lg mb-8 max-w-2xl mx-auto">
            Connect your wallet and let ArbiMind&apos;s AI engine find and execute profitable arbitrage opportunities 24/7.
          </p>
          <motion.button
            onClick={handleConnectWallet}
            className="group px-8 py-4 bg-gradient-to-r from-purple-600 to-teal-600 rounded-lg font-semibold text-white hover:from-purple-500 hover:to-teal-500 transition-all duration-300 shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 flex items-center gap-2 mx-auto"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Wallet className="w-5 h-5" />
            Connect Wallet
          </motion.button>
        </motion.div>
      </div>
    </section>
  );
}

