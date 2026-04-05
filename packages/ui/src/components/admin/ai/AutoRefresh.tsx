'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface AutoRefreshProps {
  enabled: boolean;
  intervalSec: number;
  onToggle: (on: boolean) => void;
  onTick: () => void;
}

export function AutoRefresh({ enabled, intervalSec, onToggle, onTick }: AutoRefreshProps) {
  const [countdown, setCountdown] = useState(intervalSec);
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  const reset = useCallback(() => setCountdown(intervalSec), [intervalSec]);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    const handle = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          tickRef.current();
          return intervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(handle);
  }, [enabled, intervalSec, reset]);

  // Pause on tab hidden
  useEffect(() => {
    const handler = () => {
      if (document.hidden && enabled) {
        onToggle(false);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [enabled, onToggle]);

  return (
    <div className="flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        className={`px-2 py-1 rounded font-medium ${
          enabled ? 'bg-green-600/20 text-green-300' : 'bg-dark-700 text-dark-400'
        }`}
      >
        Auto Refresh: {enabled ? 'ON' : 'OFF'}
      </button>
      {enabled && (
        <span className="text-dark-500">({countdown}s)</span>
      )}
    </div>
  );
}
