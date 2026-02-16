"use client";

import { X } from 'lucide-react';
import { useState } from 'react';

export function PromotionBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className="w-full bg-gradient-to-r from-purple-600 via-pink-500 to-cyan-500 text-white py-2 px-4 flex items-center justify-center text-sm font-semibold shadow-lg z-[100] relative">
      <span>
        🚀 Try the new Solana Wallet! Lightning swaps, instant transfers, and real-time analytics—now live. <span className="underline underline-offset-2 ml-1">Connect your wallet</span> and experience next-gen trading.
      </span>
      <button
        className="ml-4 p-1 rounded hover:bg-white/10 transition"
        onClick={() => setVisible(false)}
        aria-label="Close promotion banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
