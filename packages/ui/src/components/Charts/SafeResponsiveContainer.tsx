'use client';

import { useRef, useState, useEffect, type ComponentProps } from 'react';
import { ResponsiveContainer } from 'recharts';

type Props = ComponentProps<typeof ResponsiveContainer>;

/**
 * Wrapper around Recharts ResponsiveContainer that defers rendering
 * until the container has measurable (> 0) dimensions.
 *
 * Prevents the "width(-1) height(-1) should be greater than 0" warning
 * that fires when ResponsiveContainer mounts before the browser paints
 * (SSR hydration, dynamic imports with ssr:false, framer-motion entrance).
 */
export function SafeResponsiveContainer({
  children,
  width = '100%',
  height = '100%',
  minWidth = 1,
  minHeight = 1,
  ...rest
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
      setReady(true);
      return;
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          setReady(true);
          ro.disconnect();
          return;
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', minWidth, minHeight }}>
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
