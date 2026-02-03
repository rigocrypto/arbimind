'use client';

import { HelpCircle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface HelpTooltipProps {
  content: string;
  className?: string;
}

export function HelpTooltip({ content, className = '' }: HelpTooltipProps) {
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
    <div className={`relative inline-flex ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="p-0.5 rounded-full text-dark-400 hover:text-cyan-400 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-0 focus:ring-offset-transparent"
        aria-label="Help"
        title={content}
      >
        <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
      {visible && (
        <div
          className="absolute right-full top-1/2 -translate-y-1/2 mr-2 px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-xs text-dark-100 shadow-xl max-w-[200px] z-[100000] whitespace-normal"
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  );
}
