'use client';

import { useEffect, useRef } from 'react';
import { useSettingsStore } from './settingsStore';

export function useHydrateSettings() {
  const hydrated = useRef(false);

  useEffect(() => {
    if (!hydrated.current) {
      useSettingsStore.getState().hydrate();
      hydrated.current = true;
    }
  }, []);
}
