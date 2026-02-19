export type IdentitySource = 'private_key' | 'wallet_address_env' | 'none';

export function getIdentitySource(opts: {
  hasWallet: boolean;
  walletAddress?: string;
}): IdentitySource {
  if (opts.hasWallet) return 'private_key';
  if (opts.walletAddress?.trim()) return 'wallet_address_env';
  return 'none';
}

export function shortAddress(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}
