import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { settingsSchema, DEFAULT_SETTINGS, Settings } from '@/lib/settings';

const STORAGE_KEY = 'arbimind:settings:v1';

function safeParseSettings(raw: unknown): Settings {
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return DEFAULT_SETTINGS;
}

export const useSettingsStore = create<{
  settings: Settings;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;
  hydrate: () => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  save: () => Promise<void>;
  resetToDefaults: () => void;
}>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isDirty: false,
  isLoading: false,
  error: null,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        set({ settings: safeParseSettings(JSON.parse(raw)), isDirty: false });
      }
    } catch {
      set({ error: 'Failed to load settings' });
    }
  },
  setSetting: (key, value) => {
    set((state) => ({
      settings: { ...state.settings, [key]: value },
      isDirty: true,
    }));
  },
  save: async () => {
    set({ isLoading: true, error: null });
    try {
      const { settings } = get();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      set({ isDirty: false });
      // Optionally: sync to backend here, but must fail gracefully
    } catch {
      set({ error: 'Failed to save settings' });
    } finally {
      set({ isLoading: false });
    }
  },
  resetToDefaults: () => {
    set({ settings: DEFAULT_SETTINGS, isDirty: true });
  },
}));

export function useHydrateSettings() {
  const hydrated = useRef(false);
  const hydrate = useSettingsStore((s) => s.hydrate);
  useEffect(() => {
    if (!hydrated.current) {
      hydrate();
      hydrated.current = true;
    }
  }, [hydrate]);
}
