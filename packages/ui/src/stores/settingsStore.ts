import { create } from 'zustand';
import { settingsSchema, DEFAULT_SETTINGS, Settings } from '@/lib/settings';
import { SETTINGS_STORAGE_KEY } from '@/lib/settingsSync';

function safeParseSettings(raw: unknown): Settings {
  const parsed = settingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return DEFAULT_SETTINGS;
}

/** Validate settings and return field-level errors (empty array = valid). */
export function validateSettings(settings: Settings): string[] {
  const result = settingsSchema.safeParse(settings);
  if (result.success) return [];
  return result.error.issues.map(
    (i) => `${i.path.join('.')}: ${i.message}`,
  );
}

export const useSettingsStore = create<{
  settings: Settings;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;
  validationErrors: string[];
  hydrate: () => void;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  save: () => Promise<boolean>;
  resetToDefaults: () => void;
}>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isDirty: false,
  isLoading: false,
  error: null,
  validationErrors: [],
  hydrate: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        set({ settings: safeParseSettings(JSON.parse(raw)), isDirty: false, validationErrors: [] });
      }
    } catch {
      set({ error: 'Failed to load settings' });
    }
  },
  setSetting: (key, value) => {
    set((state) => {
      const next = { ...state.settings, [key]: value };
      return {
        settings: next,
        isDirty: true,
        validationErrors: validateSettings(next),
      };
    });
  },
  save: async () => {
    set({ isLoading: true, error: null });
    try {
      if (typeof window === 'undefined') {
        set({ error: 'Settings can only be saved in the browser' });
        return false;
      }
      const { settings } = get();
      const errors = validateSettings(settings);
      if (errors.length > 0) {
        set({ validationErrors: errors, error: 'Fix validation errors before saving' });
        return false;
      }
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      set({ isDirty: false, validationErrors: [] });
      return true;
    } catch {
      set({ error: 'Failed to save settings' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
  resetToDefaults: () => {
    set({ settings: DEFAULT_SETTINGS, isDirty: true, validationErrors: [] });
  },
}));
