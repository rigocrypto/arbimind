'use client';

import { Info } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const REVENUE_TEXT = 'Arb profits → 90% Treasury, 10% Protocol fee. MEV-protected.';

export function RevenueTooltip() {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    if (visible) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible]);

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="p-1 rounded-full text-dark-400 hover:text-cyan-400 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        aria-label="Revenue info"
      >
        <Info className="w-4 h-4" />
      </button>
      {visible && (
        <div
          className="absolute right-0 bottom-full mb-2 px-3 py-2 rounded-lg bg-dark-800 border border-dark-600 text-sm text-dark-200 shadow-xl max-w-[240px] z-50"
          role="tooltip"
        >
          {REVENUE_TEXT}
        </div>
      )}
    </div>
  );
}
