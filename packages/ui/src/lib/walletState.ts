export const WALLET_STATE_UPDATED_EVENT = 'arbimind:wallet-state-updated';

export function notifyWalletStateUpdated(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(WALLET_STATE_UPDATED_EVENT));
}