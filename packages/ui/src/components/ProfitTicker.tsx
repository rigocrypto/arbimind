'use client';

import { useEffect, useRef, useState } from 'react';

interface ProfitTickerProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function ProfitTicker({
  value,
  decimals = 2,
  prefix = '',
  suffix = '',
  className,
}: ProfitTickerProps) {
  const animationFrameRef = useRef<number | null>(null);
  const previousRef = useRef(value);
  const [displayValue, setDisplayValue] = useState(value);
  const [deltaDirection, setDeltaDirection] = useState<'up' | 'down' | 'flat'>('flat');

  useEffect(() => {
    const previous = previousRef.current;
    const nextDirection = value > previous ? 'up' : value < previous ? 'down' : 'flat';
    setDeltaDirection(nextDirection);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const durationMs = 600;
    const startMs = performance.now();

    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

    const tick = (nowMs: number) => {
      const elapsed = nowMs - startMs;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(progress);
      const animated = previous + (value - previous) * eased;
      setDisplayValue(animated);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    previousRef.current = value;

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value]);

  const formatted = `${prefix}${displayValue.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;

  return (
    <span
      className={[
        className ?? '',
        deltaDirection === 'up'
          ? 'profit-flash-positive'
          : deltaDirection === 'down'
          ? 'profit-flash-negative'
          : '',
      ].join(' ')}
    >
      <span>{formatted}</span>
      {deltaDirection === 'up' && <span className="ml-1 text-green-300">↑</span>}
      {deltaDirection === 'down' && <span className="ml-1 text-red-300">↓</span>}
    </span>
  );
}
