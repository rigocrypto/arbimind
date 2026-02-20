'use client';

import { useEffect, useRef } from 'react';
import { useSettingsStore } from './settingsStore';

export function useHydrateSettings() {
  const hydrated = useRef(false);
  const hydrate = useSettingsStore((state) => state.hydrate);

  useEffect(() => {
    if (!hydrated.current) {
      hydrate();
      hydrated.current = true;
    }
  }, [hydrate]);
}
