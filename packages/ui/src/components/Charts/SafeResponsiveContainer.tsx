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
  const [ready, setReady] = useState(false);

  // 1. Synchronous check on first render via ref callback — if the
  //    container already has layout we mark ready immediately without
  //    waiting for an effect, avoiding the lint issue with setState
  //    inside useEffect.
  const refCallback = (el: HTMLDivElement | null) => {
    ref.current = el;
    if (el && !ready) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setReady(true);
      }
    }
  };

  useEffect(() => {
    if (ready) return;

    const el = ref.current;
    if (!el) return;

    // 2. ResizeObserver for when layout arrives after mount.
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          setReady(true);
          ro.disconnect();
          clearInterval(poll);
          return;
        }
      }
    });

    // 3. Polling fallback — hidden containers (inactive tabs, collapsed
    //    accordions) may never trigger ResizeObserver. Poll every 500ms
    //    but *only* set ready when dimensions are actually positive.
    const poll = setInterval(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setReady(true);
        clearInterval(poll);
        ro.disconnect();
      }
    }, 500);

    ro.observe(el);
    return () => {
      clearInterval(poll);
      ro.disconnect();
    };
  }, [ready]);

  return (
    <div ref={refCallback} style={{ width: '100%', height: '100%', minWidth, minHeight }}>
      {ready ? (
        <ResponsiveContainer
          width={width}
          height={height}
          minWidth={minWidth}
          minHeight={minHeight}
          {...rest}
        >
          {children}
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}
