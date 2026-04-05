import { apiUrl } from './apiConfig';

// ─── Types ──────────────────────────────────────────────────────────

export interface DevnetBalances {
  userWallet: { address: string; solBalance: number; usdcBalance: number };
  arbAccount: { address: string; solBalance: number; usdcBalance: number };
  network: 'devnet';
  slot: number;
}

export interface AirdropResult {
  success: boolean;
  signature?: string;
  newBalance?: number;
  error?: string;
  retryAfterSec?: number;
}

export interface TransferResult {
  success: boolean;
  signature?: string;
  newBalances?: { from: number; to: number };
  error?: string;
  detail?: string;
}

// ─── API Calls ──────────────────────────────────────────────────────

export async function getDevnetBalances(walletPubkey: string): Promise<DevnetBalances> {
  const res = await fetch(apiUrl(`/solana/devnet-balances?wallet=${encodeURIComponent(walletPubkey)}`));
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || `Failed to fetch balances (${res.status})`);
  }
  return res.json();
}

export async function requestAirdrop(wallet: string, amount: number): Promise<AirdropResult> {
  const res = await fetch(apiUrl('/solana/devnet-airdrop'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, amount }),
  });
  const body = await res.json();
  if (!res.ok && !body.success) {
    return {
      success: false,
      error: body.error || `HTTP ${res.status}`,
      retryAfterSec: body.retryAfterSec,
    };
  }
  return body;
}

export async function submitTransfer(payload: {
  fromWallet: string;
  toWallet: string;
  amountSol: number;
  signedTx: string;
}): Promise<TransferResult> {
  const res = await fetch(apiUrl('/solana/devnet-transfer'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok && !body.success) {
    return { success: false, error: body.error || `HTTP ${res.status}`, detail: body.detail };
  }
  return body;
}
