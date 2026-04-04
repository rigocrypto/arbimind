export const SETTINGS_STORAGE_KEY = 'arbimind:settings:v1';

/**
 * Subscribe to settings changes coming from **other tabs**.
 * Uses the native `storage` event which fires only when another tab
 * writes to localStorage under the settings key.
 *
 * Returns an unsubscribe function.
 */
export function onCrossTabSettingsChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: StorageEvent) => {
    if (e.key === SETTINGS_STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
