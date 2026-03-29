'use client';

import { useState, useEffect } from 'react';
import { useHydrated } from './useHydrated';

function toValidDate(value: number | string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Hook to format relative time that avoids hydration errors
 * Returns a stable value during SSR and updates on client
 */
export function useRelativeTime(timestamp: number | string | Date | null | undefined): string {
  const [relativeTime, setRelativeTime] = useState('Just now');
  const mounted = useHydrated();

  useEffect(() => {
    const updateTime = () => {
      const date = toValidDate(timestamp);
      if (!date) {
        setRelativeTime('Just now');
        return;
      }
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      let result = 'Just now';
      if (diffSec < 60) result = `${diffSec}s ago`;
      else if (diffMin < 60) result = `${diffMin}m ago`;
      else if (diffHour < 24) result = `${diffHour}h ago`;
      else if (diffDay < 7) result = `${diffDay}d ago`;
      else result = date.toLocaleDateString();

      setRelativeTime(result);
    };

    updateTime();
    
    // Update every 10 seconds for recent times
    const interval = setInterval(updateTime, 10000);
    
    return () => clearInterval(interval);
  }, [timestamp]);

  // Return stable value during SSR
  if (!mounted) {
    return 'Just now';
  }

  return relativeTime;
}

