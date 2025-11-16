'use client';

import { motion } from 'framer-motion';
import { Wallet } from 'lucide-react';
import { fadeIn } from '@/lib/animations';

export function CTA() {
  const handleConnectWallet = () => {
    // Mock wallet connection
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      (window as any).ethereum.request({ method: 'eth_requestAccounts' });
    } else {
      alert('Please install MetaMask to connect your wallet');
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
            Connect your wallet and let ArbiMind's AI engine find and execute profitable arbitrage opportunities 24/7.
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

