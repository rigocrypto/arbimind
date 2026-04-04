export const WALLET_STATE_UPDATED_EVENT = 'arbimind:wallet-state-updated';

/** LocalStorage key prefix used by wallet pages. */
export const WALLET_LS_PREFIX = 'arbimind:wallet:';

export function notifyWalletStateUpdated(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(WALLET_STATE_UPDATED_EVENT));
}

/**
 * Subscribe to wallet-state changes coming from **other tabs**.
 * Uses the native `storage` event which fires only when another tab
 * writes to localStorage under the `arbimind:wallet:` prefix.
 *
 * Returns an unsubscribe function.
 */
export function onCrossTabWalletChange(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(WALLET_LS_PREFIX)) {
      callback();
    }
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}