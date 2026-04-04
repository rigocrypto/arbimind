import { create } from 'zustand';
import { settingsSchema, DEFAULT_SETTINGS, Settings } from '@/lib/settings';
import { SETTINGS_STORAGE_KEY } from '@/lib/settingsSync';
import { API_BASE } from '@/lib/apiConfig';
import { getAdminKey, hasAdminKey } from '@/lib/adminApi';

/* ------------------------------------------------------------------ */
/*  Field mapping: frontend Settings ↔ backend EngineSettings         */
/* ------------------------------------------------------------------ */
interface BackendSettings {
  autoTrade: boolean;
  minProfitEth: number;
  maxGasGwei: number;
  slippagePct: number;
  riskLevel: 'low' | 'medium' | 'high';
  preferredChains: string[];
  requiredConfirmations: number;
  flashloanMaxEth: number;
  mevProtection: boolean;
  browserNotifications: boolean;
  emailAlerts: boolean;
  discordAlerts: boolean;
  discordWebhookUrl: string | null;
  primaryRpcUrl: string | null;
  privateRelayUrl: string | null;
  walletConnectProjectId: string | null;
  updatedAt: string;
}

export interface AppliedMeta {
  autoTrade: boolean;
  minProfitEth: boolean;
  maxGasGwei: boolean;
  preferredChains: boolean;
  slippagePct: boolean;
  riskLevel: boolean;
  requiredConfirmations: boolean;
  flashloanMaxEth: boolean;
  mevProtection: boolean;
  browserNotifications: boolean;
  emailAlerts: boolean;
  discordAlerts: boolean;
  primaryRpcUrl: boolean;
  privateRelayUrl: boolean;
  walletConnectProjectId: boolean;
}

function backendToFrontend(b: BackendSettings): Settings {
  return {
    autoTrade: b.autoTrade,
    minProfit: b.minProfitEth,
    maxGas: b.maxGasGwei,
    slippage: b.slippagePct,
    riskLevel: b.riskLevel,
    preferredChains: b.preferredChains.map(
      (c) => c.charAt(0).toUpperCase() + c.slice(1),
    ),
    txConfirmations: b.requiredConfirmations,
    flashloanMax: b.flashloanMaxEth,
    mevProtection: b.mevProtection,
    notifications: b.browserNotifications,
    emailAlerts: b.emailAlerts,
    discordAlerts: b.discordAlerts,
    rpcUrl: b.primaryRpcUrl ?? '',
    privateRelay: b.privateRelayUrl ?? '',
    wcProjectId: b.walletConnectProjectId ?? '',
  };
}

function frontendToBackend(f: Settings): Partial<BackendSettings> {
  return {
    autoTrade: f.autoTrade,
    minProfitEth: f.minProfit,
    maxGasGwei: f.maxGas,
    slippagePct: f.slippage,
    riskLevel: f.riskLevel,
    preferredChains: f.preferredChains.map((c) => c.toLowerCase()),
    requiredConfirmations: f.txConfirmations,
    flashloanMaxEth: f.flashloanMax,
    mevProtection: f.mevProtection,
    browserNotifications: f.notifications,
    emailAlerts: f.emailAlerts,
    discordAlerts: f.discordAlerts,
    primaryRpcUrl: f.rpcUrl || null,
    privateRelayUrl: f.privateRelay || null,
    walletConnectProjectId: f.wcProjectId || null,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

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

function cacheToLocal(settings: Settings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch { /* quota or private mode — non-fatal */ }
}

function readLocalCache(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return safeParseSettings(JSON.parse(raw));
  } catch { /* corrupt — ignore */ }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Store                                                             */
/* ------------------------------------------------------------------ */

export const useSettingsStore = create<{
  settings: Settings;
  isDirty: boolean;
  isLoading: boolean;
  error: string | null;
  validationErrors: string[];
  source: 'backend' | 'local-cache' | 'defaults';
  applied: AppliedMeta;
  hydrate: () => Promise<void>;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  save: () => Promise<boolean>;
  resetToDefaults: () => Promise<void>;
}>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isDirty: false,
  isLoading: false,
  error: null,
  validationErrors: [],
  source: 'defaults',
  applied: {
    autoTrade: false, minProfitEth: false, maxGasGwei: false, preferredChains: false,
    slippagePct: false, riskLevel: false, requiredConfirmations: false,
    flashloanMaxEth: false, mevProtection: false,
    browserNotifications: false, emailAlerts: false, discordAlerts: false,
    primaryRpcUrl: false, privateRelayUrl: false, walletConnectProjectId: false,
  },

  hydrate: async () => {
    if (typeof window === 'undefined') return;

    // 1. Immediate local cache so UI is not blank
    const cached = readLocalCache();
    if (cached) {
      set({ settings: cached, source: 'local-cache', isDirty: false, validationErrors: [] });
    }

    // 2. Try backend
    try {
      const res = await fetch(`${API_BASE}/settings`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.settings) {
          const settings = backendToFrontend(json.settings as BackendSettings);
          cacheToLocal(settings);
          set({
            settings,
            source: 'backend',
            applied: json.applied ?? get().applied,
            isDirty: false,
            validationErrors: [],
            error: null,
          });
          return;
        }
      }
      // Non-OK response — keep local cache, note the source
      if (!cached) {
        set({ source: 'defaults' });
      }
    } catch {
      // Network error — stay on local cache or defaults
      if (!cached) {
        set({ source: 'defaults' });
      }
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

      // Always cache locally
      cacheToLocal(settings);

      // Try backend save if admin key is present
      if (hasAdminKey()) {
        try {
          const res = await fetch(`${API_BASE}/settings`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-ADMIN-KEY': getAdminKey(),
            },
            body: JSON.stringify(frontendToBackend(settings)),
            signal: AbortSignal.timeout(8000),
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json.ok) {
            set({
              isDirty: false,
              validationErrors: [],
              source: 'backend',
              applied: json.applied ?? get().applied,
            });
            return true;
          }
          // Backend validation error
          const backendError = json.error ?? 'Backend rejected settings';
          set({ error: backendError });
          return false;
        } catch {
          // Backend unreachable — saved locally, warn user
          set({
            isDirty: false,
            validationErrors: [],
            source: 'local-cache',
            error: 'Saved locally — backend unreachable. Changes will sync on next connection.',
          });
          return true;
        }
      }

      // No admin key — local save only
      set({ isDirty: false, validationErrors: [], source: 'local-cache' });
      return true;
    } catch {
      set({ error: 'Failed to save settings' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  resetToDefaults: async () => {
    // Try backend reset if admin key is present
    if (hasAdminKey()) {
      try {
        const res = await fetch(`${API_BASE}/settings/reset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ADMIN-KEY': getAdminKey(),
          },
          signal: AbortSignal.timeout(8000),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.ok && json.settings) {
          const settings = backendToFrontend(json.settings as BackendSettings);
          cacheToLocal(settings);
          set({
            settings,
            isDirty: false,
            validationErrors: [],
            source: 'backend',
            applied: json.applied ?? get().applied,
          });
          return;
        }
      } catch { /* backend down — fall through to local reset */ }
    }
    cacheToLocal(DEFAULT_SETTINGS);
    set({ settings: DEFAULT_SETTINGS, isDirty: false, validationErrors: [], source: 'local-cache' });
  },
}));
