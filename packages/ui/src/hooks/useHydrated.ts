'use client';

import { useState, useEffect } from 'react';

/**
 * Returns true only after the first client mount. Use to defer rendering of
 * components that can trigger "setState during render" during hydration
 * (e.g. RainbowKit ConnectModal + React Query Hydrate).
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
