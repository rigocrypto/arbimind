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
  save: () => Promise<boolean>;
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
      if (typeof window === 'undefined') {
        set({ error: 'Settings can only be saved in the browser' });
        return false;
      }
      const { settings } = get();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      set({ isDirty: false });
      return true;
    } catch {
      set({ error: 'Failed to save settings' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
  resetToDefaults: () => {
    set({ settings: DEFAULT_SETTINGS, isDirty: true });
  },
}));
