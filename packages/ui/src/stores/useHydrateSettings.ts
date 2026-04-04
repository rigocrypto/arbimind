'use client';

import { useEffect, useRef } from 'react';
import { useSettingsStore } from './settingsStore';
import { onCrossTabSettingsChange } from '@/lib/settingsSync';

export function useHydrateSettings() {
  const hydrated = useRef(false);

  useEffect(() => {
    if (!hydrated.current) {
      useSettingsStore.getState().hydrate();
      hydrated.current = true;
    }

    // Re-hydrate when another tab writes to the settings key
    const unsub = onCrossTabSettingsChange(() => {
      useSettingsStore.getState().hydrate();
    });

    return unsub;
  }, []);
}
