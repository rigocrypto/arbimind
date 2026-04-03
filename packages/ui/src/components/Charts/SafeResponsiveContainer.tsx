'use client';

import { useRef, useState, useEffect, type ComponentProps } from 'react';
import { ResponsiveContainer } from 'recharts';

type Props = ComponentProps<typeof ResponsiveContainer>;

/**
 * Wrapper around Recharts ResponsiveContainer that blocks rendering
 * until the container has confirmed positive dimensions.
 *
 * Three-tier strategy:
 *  1. Synchronous getBoundingClientRect() check on mount
 *  2. ResizeObserver for async layout changes
 *  3. Polling fallback for hidden containers (inactive tabs, accordions)
 *
 * Never sets ready without verifying dimensions > 0, which permanently
 * prevents the "width(-1) height(-1) should be greater than 0" warning.
 */
export function SafeResponsiveContainer({
  children,
  width = '100%',
  height = '100%',
  minWidth = 1,
  minHeight = 1,
  ...rest
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  // null = not ready; { width, height } = measured and ready to render.
  // Using state (not a ref) so the value is safe to read during render.
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);

  const tryMeasure = (el: HTMLDivElement): boolean => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setMeasured({ width: Math.round(rect.width), height: Math.round(rect.height) });
      return true;
    }
    return false;
  };

  // 1. Synchronous check on first render via ref callback — if the
  //    container already has layout we mark ready immediately without
  //    waiting for an effect, avoiding the lint issue with setState
  //    inside useEffect.
  const refCallback = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (el && !measured) {
      tryMeasure(el);
    }
  };

  useEffect(() => {
    if (measured) return;

    const el = ref.current;
    if (!el) return;

    // 2. ResizeObserver for when layout arrives after mount.
    const ro = new ResizeObserver(() => {
      if (tryMeasure(el)) {
        ro.disconnect();
        clearInterval(poll);
      }
    });

    // 3. Polling fallback — hidden containers (inactive tabs, collapsed
    //    accordions) may never trigger ResizeObserver. Poll every 500ms
    //    but *only* set ready when dimensions are actually positive.
    const poll = setInterval(() => {
      if (tryMeasure(el)) {
        clearInterval(poll);
        ro.disconnect();
      }
    }, 500);

    ro.observe(el);
    return () => {
      clearInterval(poll);
      ro.disconnect();
    };
  }, [measured]);

  return (
    <div ref={refCallback} style={{ width: '100%', height: '100%', minWidth, minHeight }}>
      {measured ? (
        <ResponsiveContainer
          width={width}
          height={height}
          minWidth={minWidth}
          minHeight={minHeight}
          initialDimension={measured}
          {...rest}
        >
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
